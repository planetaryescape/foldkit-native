import { expect, it } from "@effect/vitest"
import { Effect, Exit, Redacted } from "effect"
import type { TelemetryExporter } from "../packages/telemetry/src/exporter"
import type { TelemetryRecord } from "../packages/telemetry/src/record"
import { makeRelayHandler } from "./telemetry-relay"

const token = "synthetic-session-token-for-relay-tests"
const event = {
  _tag: "Event",
  name: "host.started",
  outcome: "success",
  timestampUnixNano: "1794744000010000000",
}
const request = (
  body: string,
  headers?: Record<string, string>,
  path = "/events",
  method = "POST",
) =>
  new Request(`http://127.0.0.1${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...headers },
    body,
  })
const recordingExporter = () => {
  const records: Array<TelemetryRecord> = []
  const exporter: TelemetryExporter = {
    enabled: true,
    offer: (record) => {
      records.push(record)
    },
    flush: Effect.void,
  }
  return { records, exporter }
}

it.effect("accepts one authenticated schema-decoded record as explicitly best-effort", () =>
  Effect.gen(function* () {
    const { records, exporter } = recordingExporter()
    const handle = yield* makeRelayHandler(exporter, Redacted.make(token))
    const response = yield* handle(request(JSON.stringify(event)))
    expect(response.status).toBe(202)
    expect(yield* Effect.promise(() => response.text())).toBe("Accepted for best-effort export.")
    expect(records).toEqual([event])
  }),
)

it.effect("rejects authentication, unknown routes, malformed JSON, and private fields", () =>
  Effect.gen(function* () {
    const { records, exporter } = recordingExporter()
    const handle = yield* makeRelayHandler(exporter, Redacted.make(token))
    for (const input of [
      request(JSON.stringify(event), { authorization: "" }),
      request(JSON.stringify(event), { authorization: `Bearer ${"x".repeat(token.length)}` }),
    ]) {
      const response = yield* handle(input)
      expect(response.status).toBe(401)
      expect(yield* Effect.promise(() => response.text())).toBe("Unauthorized.")
    }
    expect((yield* handle(request("{}", {}, "/other"))).status).toBe(404)
    expect((yield* handle(request("{}", {}, "/events?token=ignored"))).status).toBe(404)
    expect((yield* handle(request("{}", {}, "/events", "PUT"))).status).toBe(404)
    for (const body of [
      "not-json",
      JSON.stringify({ ...event, cause: "synthetic-private-value" }),
    ]) {
      const response = yield* handle(request(body))
      expect(response.status).toBe(400)
      expect(yield* Effect.promise(() => response.text())).toBe("Invalid record.")
    }
    expect(records).toEqual([])
  }),
)

it.effect("checks both declared length and actual streamed bytes", () =>
  Effect.gen(function* () {
    const { records, exporter } = recordingExporter()
    const handle = yield* makeRelayHandler(exporter, Redacted.make(token))
    expect((yield* handle(request("{}", { "content-length": "16385" }))).status).toBe(413)
    for (const headers of [{}, { "content-length": "1" }]) {
      const response = yield* handle(request(" ".repeat(16385), headers))
      expect(response.status).toBe(413)
      expect(yield* Effect.promise(() => response.text())).toBe("Body too large.")
    }
    expect(records).toEqual([])
  }),
)

it.effect("refuses disabled exporters and short or non-ASCII session tokens", () =>
  Effect.gen(function* () {
    const { exporter } = recordingExporter()
    for (const token of ["short", " ".repeat(32), "é".repeat(32)]) {
      const exit = yield* Effect.exit(makeRelayHandler(exporter, Redacted.make(token)))
      expect(Exit.isFailure(exit)).toBe(true)
    }
    const disabled = yield* Effect.exit(
      makeRelayHandler({ ...exporter, enabled: false }, Redacted.make(token)),
    )
    expect(Exit.isFailure(disabled)).toBe(true)
  }),
)

it.effect("uses the same 32-to-256-byte token limits as the native transport", () =>
  Effect.gen(function* () {
    const { exporter, records } = recordingExporter()
    for (const length of [32, 256]) {
      const value = "x".repeat(length)
      const handle = yield* makeRelayHandler(exporter, Redacted.make(value))
      const response = yield* handle(
        request(JSON.stringify(event), { authorization: `Bearer ${value}` }),
      )
      expect(response.status).toBe(202)
    }
    for (const length of [31, 257, 512]) {
      const exit = yield* Effect.exit(makeRelayHandler(exporter, Redacted.make("x".repeat(length))))
      expect(Exit.isFailure(exit)).toBe(true)
    }
    expect(records).toEqual([event, event])
  }),
)
