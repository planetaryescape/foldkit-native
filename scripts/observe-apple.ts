import { Cause, Effect, Exit } from "effect"
import { FetchHttpClient } from "effect/http"
import { exporterFromConfig } from "../packages/telemetry/src/exporter"
import { decodeTelemetryRecord } from "../packages/telemetry/src/record"

const prefix = "FOLDKIT_TELEMETRY "
const limit = 16 * 1024
const desktopOnly = new Set([
  "OTEL_EXPORTER_OTLP_HEADERS",
  "OTEL_EXPORTER_OTLP_TRACES_HEADERS",
  "OTEL_EXPORTER_OTLP_LOGS_HEADERS",
  "OTEL_EXPORTER_OTLP_METRICS_HEADERS",
  "OTEL_AUTH_TOKEN",
  "OP_SERVICE_ACCOUNT_TOKEN",
  "SOPS_AGE_KEY",
  "SOPS_AGE_KEY_FILE",
  "FOLDKIT_TELEMETRY_RELAY_URL",
  "FOLDKIT_TELEMETRY_SESSION_TOKEN",
])

export const safeNativeEnvironment = (
  environment: Readonly<Record<string, string | undefined>>,
) => ({
  ...Object.fromEntries(Object.entries(environment).filter(([key]) => !desktopOnly.has(key))),
  FOLDKIT_TELEMETRY_STDOUT: "1",
})

const consume = (stream: ReadableStream<Uint8Array>, line: (text: string) => Effect.Effect<void>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => stream.getReader()),
    (reader) =>
      Effect.gen(function* () {
        const decoder = new TextDecoder()
        let buffered = ""
        let dropping = false
        while (true) {
          const next = yield* Effect.tryPromise(() => reader.read())
          if (next.done) break
          const text = decoder.decode(next.value, { stream: true })
          for (const piece of text.split(/(?<=\n)/)) {
            if (!dropping) buffered += piece
            if (buffered.length > limit) {
              buffered = ""
              dropping = true
            }
            if (piece.endsWith("\n")) {
              if (!dropping) yield* line(buffered.replace(/\r?\n$/, ""))
              buffered = ""
              dropping = false
            }
          }
        }
        if (!dropping && buffered !== "") yield* line(buffered)
      }),
    (reader) => Effect.sync(() => reader.releaseLock()),
  )

const program = Effect.gen(function* () {
  const exporter = yield* exporterFromConfig
  let warned = false
  const invalid = Effect.sync(() => {
    if (warned) return
    warned = true
    console.error("Foldkit telemetry record rejected.")
  })
  const child = yield* Effect.acquireRelease(
    Effect.try(() =>
      Bun.spawn(
        ["swift", "run", "--package-path", "native/apple", "HostProbe", "dist/counter.js"],
        {
          stdout: "pipe",
          stderr: "pipe",
          env: safeNativeEnvironment(process.env),
        },
      ),
    ),
    (process) =>
      Effect.sync(() => {
        if (process.exitCode === null) process.kill()
      }),
  )
  const stdout = consume(child.stdout, (line) => {
    if (!line.startsWith(prefix)) {
      return Effect.sync(() => {
        console.log(line)
      })
    }
    return Effect.try((): unknown => JSON.parse(line.slice(prefix.length))).pipe(
      Effect.flatMap(decodeTelemetryRecord),
      Effect.flatMap((record) => Effect.sync(() => exporter.offer(record))),
      Effect.catchCause(() => invalid),
    )
  })
  const stderr = consume(child.stderr, (line) =>
    Effect.sync(() => {
      console.error(line)
    }),
  )
  const [, , exitCode] = yield* Effect.all([stdout, stderr, Effect.promise(() => child.exited)], {
    concurrency: "unbounded",
  })
  yield* exporter.flush
  return exitCode
}).pipe(
  Effect.scoped,
  Effect.provide(FetchHttpClient.layer),
  Effect.catchCause((cause) =>
    Cause.hasInterruptsOnly(cause)
      ? Effect.failCause(cause)
      : Effect.sync(() => {
          console.error("Unable to observe the Apple host probe.")
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
