import { timingSafeEqual } from "node:crypto"
import { Cause, Config, Effect, Exit, FiberSet, Option, Redacted, Schema } from "effect"
import { FetchHttpClient } from "effect/http"
import { exporterFromConfig } from "../packages/telemetry/src/exporter"
import type { TelemetryExporter } from "../packages/telemetry/src/exporter"
import { decodeTelemetryRecord } from "../packages/telemetry/src/record"

const maxBody = 16 * 1024
class RelayUnavailable extends Schema.TaggedError<RelayUnavailable>()("RelayUnavailable", {}) {}

const readBody = (request: Request) =>
  Effect.gen(function* () {
    const body = request.body
    if (body === null) return ""
    return yield* Effect.acquireUseRelease(
      Effect.sync(() => body.getReader()),
      (reader) =>
        Effect.gen(function* () {
          const chunks: Array<Uint8Array> = []
          let size = 0
          while (true) {
            const chunk = yield* Effect.tryPromise(() => reader.read())
            if (chunk.done) break
            size += chunk.value.length
            if (size > maxBody) return undefined
            chunks.push(chunk.value)
          }
          return yield* Effect.try(() =>
            new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, size)),
          )
        }),
      (reader) =>
        Effect.gen(function* () {
          yield* Effect.tryPromise(() => reader.cancel()).pipe(
            Effect.ignore,
            Effect.interruptible,
            Effect.timeoutOption("100 millis"),
          )
          reader.releaseLock()
        }),
    )
  })

export const makeRelayHandler = (exporter: TelemetryExporter, token: Redacted.Redacted<string>) =>
  Effect.gen(function* () {
    const raw = Redacted.value(token)
    if (!exporter.enabled || !/^[!-~]{32,256}$/.test(raw)) {
      return yield* Effect.fail(new RelayUnavailable())
    }
    const expected = Buffer.from(`Bearer ${raw}`, "ascii")
    return (request: Request): Effect.Effect<Response> =>
      Effect.gen(function* () {
        const url = new URL(request.url)
        if (request.method !== "POST" || url.pathname !== "/events" || url.search !== "") {
          return new Response("Not found.", { status: 404 })
        }
        const authorization = request.headers.get("authorization") ?? ""
        const candidate = Buffer.from(authorization, "utf8")
        if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) {
          return new Response("Unauthorized.", { status: 401 })
        }
        const length = request.headers.get("content-length")
        if (length !== null && (!/^[0-9]+$/.test(length) || Number(length) > maxBody)) {
          return new Response("Invalid body size.", { status: 413 })
        }
        const body = yield* readBody(request).pipe(Effect.timeoutOption("2 seconds"))
        if (Option.isNone(body)) return new Response("Request timed out.", { status: 408 })
        if (body.value === undefined) return new Response("Body too large.", { status: 413 })
        const record = yield* Effect.try((): unknown => JSON.parse(body.value ?? "")).pipe(
          Effect.flatMap(decodeTelemetryRecord),
        )
        exporter.offer(record)
        return new Response("Accepted for best-effort export.", { status: 202 })
      }).pipe(
        Effect.catchCause(() => Effect.succeed(new Response("Invalid record.", { status: 400 }))),
      )
  })

const program = Effect.gen(function* () {
  const token = yield* Config.Redacted("FOLDKIT_TELEMETRY_SESSION_TOKEN")
  const port = yield* Config.Number("FOLDKIT_TELEMETRY_PORT").pipe(Config.withDefault(4319))
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    return yield* Effect.fail(new RelayUnavailable())
  }
  const exporter = yield* exporterFromConfig
  const handle = yield* makeRelayHandler(exporter, token)
  const run = yield* FiberSet.makeRuntimePromise<never, Response, never>()
  const server = yield* Effect.acquireRelease(
    Effect.try(() =>
      Bun.serve({
        hostname: "127.0.0.1",
        port,
        maxRequestBodySize: maxBody,
        fetch: (request) => run(handle(request), { signal: request.signal }),
        error: () => new Response("Request unavailable.", { status: 503 }),
      }),
    ),
    (server) => Effect.promise(() => server.stop(true)),
  )
  console.log(`Foldkit telemetry relay listening on 127.0.0.1:${server.port}; best-effort export.`)
  yield* Effect.never
}).pipe(
  Effect.scoped,
  Effect.provide(FetchHttpClient.layer),
  Effect.catchCause((cause) =>
    Cause.hasInterruptsOnly(cause)
      ? Effect.failCause(cause)
      : Effect.sync(() => {
          console.error(
            "Foldkit telemetry relay unavailable; enable export and configure a session token.",
          )
          return 1
        }),
  ),
)

if (import.meta.main) {
  const controller = new AbortController()
  let interrupted: number | undefined
  const stop = (code: number) => {
    interrupted = code
    controller.abort()
  }
  const sigint = () => stop(130)
  const sigterm = () => stop(143)
  process.once("SIGINT", sigint)
  process.once("SIGTERM", sigterm)
  try {
    const exit = await Effect.runPromiseExit(program, { signal: controller.signal })
    process.exitCode = interrupted ?? (Exit.isSuccess(exit) ? exit.value : 1)
  } finally {
    process.off("SIGINT", sigint)
    process.off("SIGTERM", sigterm)
  }
}
