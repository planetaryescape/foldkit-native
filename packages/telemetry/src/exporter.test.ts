import { expect, it } from "@effect/vitest"
import { ConfigProvider, Effect, Layer, Logger, Redacted, References } from "effect"
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/http"
import { OtlpExporter, OtlpSerialization } from "effect/observability"
import { exporterFromConfig, makeExporter } from "./exporter"
import { decodeTelemetryRecord } from "./record"

const traceId = "1234567890abcdef1234567890abcdef"
const spanId = "1234567890abcdef"
const parentSpanId = "abcdef1234567890"
const secret = "synthetic-secret-do-not-export"
const record = {
  _tag: "Span",
  name: "Counter.command",
  traceId,
  spanId,
  parentSpanId,
  startTimeUnixNano: "1794744000000000000",
  endTimeUnixNano: "1794744000010000000",
  outcome: "failure",
  commandName: "DelayedIncrement",
}

const recording = () => {
  const requests: Array<{
    readonly url: string
    readonly contentType: string | undefined
    readonly body: Uint8Array
  }> = []
  const client = HttpClient.make((request) =>
    Effect.sync(() => {
      if (request.body._tag === "Uint8Array") {
        requests.push({
          url: request.url,
          contentType: request.headers["content-type"],
          body: request.body.body,
        })
      }
      return HttpClientResponse.fromWeb(request, new Response(null, { status: 200 }))
    }),
  )
  return { requests, client }
}

const dependencies = (
  client: HttpClient.HttpClient,
  serialization = OtlpSerialization.layerProtobuf,
) =>
  Layer.mergeAll(
    Layer.succeed(HttpClient.HttpClient, client),
    serialization,
    OtlpExporter.layerFlusher,
  )

it.effect(
  "exports official protobuf traces and correlated structured logs without raw fields",
  () =>
    Effect.gen(function* () {
      const { requests, client } = recording()
      const safe = yield* decodeTelemetryRecord(record)
      yield* Effect.gen(function* () {
        const exporter = yield* makeExporter({
          endpoint: "https://collector.example",
          headers: Redacted.make(`Authorization=Bearer ${secret}`),
        })
        const enriched = {
          ...safe,
          model: secret,
          cause: { message: secret },
          stack: secret,
          input: secret,
        }
        exporter.offer(enriched)
        exporter.offer(
          yield* decodeTelemetryRecord({
            _tag: "Event",
            name: "host.failure",
            outcome: "failure",
            timestampUnixNano: "1794744000010000000",
            failureTag: "javaScript",
          }),
        )
        yield* exporter.flush
      }).pipe(Effect.scoped, Effect.provide(dependencies(client)))
      expect(requests.map((request) => request.url).sort()).toEqual([
        "https://collector.example/v1/logs",
        "https://collector.example/v1/traces",
      ])
      for (const request of requests) {
        expect(request.contentType).toBe("application/x-protobuf")
        const text = new TextDecoder().decode(request.body)
        expect(text).toContain("foldkit-native.apple-host")
        expect(text).toContain("deployment.environment.name")
        expect(text).toContain("local")
        expect(text).not.toContain(secret)
        expect(text).not.toContain("exception")
        expect(Buffer.from(request.body).includes(Buffer.from(traceId, "hex"))).toBe(true)
        expect(Buffer.from(request.body).includes(Buffer.from(spanId, "hex"))).toBe(true)
      }
      const trace = requests.find((request) => request.url.endsWith("/traces"))
      expect(trace).toBeDefined()
      if (trace !== undefined) {
        expect(Buffer.from(trace.body).includes(Buffer.from(`0a10${traceId}`, "hex"))).toBe(true)
        expect(Buffer.from(trace.body).includes(Buffer.from(`2208${parentSpanId}`, "hex"))).toBe(
          true,
        )
        expect(new TextDecoder().decode(trace.body)).toContain("DelayedIncrement")
      }
      const logs = requests.find((request) => request.url.endsWith("/logs"))
      expect(logs).toBeDefined()
      if (logs !== undefined) {
        expect(new TextDecoder().decode(logs.body)).toContain("host.failure")
        expect(new TextDecoder().decode(logs.body)).toContain("javaScript")
      }
    }),
)

it.effect("is explicitly opt-in and honors signal opt-outs and per-signal endpoints", () =>
  Effect.gen(function* () {
    const { requests, client } = recording()
    const run = Effect.gen(function* () {
      const exporter = yield* exporterFromConfig
      exporter.offer(yield* decodeTelemetryRecord(record))
      yield* exporter.flush
    }).pipe(Effect.scoped, Effect.provideService(HttpClient.HttpClient, client))
    yield* run.pipe(
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromUnknown({
          OTEL_EXPORTER_OTLP_ENDPOINT: "https://collector.example",
        }),
      ),
    )
    expect(requests).toHaveLength(0)
    yield* run.pipe(
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromUnknown({
          FOLDKIT_TELEMETRY_ENABLED: "true",
          OTEL_TRACES_EXPORTER: "none",
          OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: "https://logs.example/custom",
        }),
      ),
    )
    expect(requests.map((request) => request.url)).toEqual(["https://logs.example/custom"])
  }),
)

it.effect("bounds the pending queue and flushes during scoped shutdown", () =>
  Effect.gen(function* () {
    const { requests, client } = recording()
    yield* Effect.gen(function* () {
      const exporter = yield* makeExporter({
        endpoint: "https://collector.example",
        headers: Redacted.make(""),
        logs: false,
      })
      const safe = yield* decodeTelemetryRecord(record)
      for (let index = 0; index < 1000; index += 1) exporter.offer(safe)
    }).pipe(Effect.scoped, Effect.provide(dependencies(client)))
    expect(requests).toHaveLength(4)
    expect(requests.every((request) => request.body.length < 32_768)).toBe(true)
  }),
)

it.live("bounds a stalled exporter shutdown and preserves the observed result", () =>
  Effect.gen(function* () {
    let attempts = 0
    const client = HttpClient.make(() =>
      Effect.sync(() => {
        attempts += 1
      }).pipe(Effect.andThen(Effect.never)),
    )
    const started = performance.now()
    const result = yield* Effect.gen(function* () {
      const exporter = yield* makeExporter({
        endpoint: "https://collector.example",
        headers: Redacted.make(`Authorization=Bearer ${secret}`),
      })
      exporter.offer(yield* decodeTelemetryRecord(record))
      return "business-success"
    }).pipe(Effect.scoped, Effect.provide(dependencies(client)))
    expect(result).toBe("business-success")
    expect(performance.now() - started).toBeLessThan(3000)
    expect(attempts).toBeGreaterThan(0)
    expect(attempts).toBeLessThanOrEqual(2)
  }),
)

it.live("does not send SDK transport causes to application loggers, even on finalization", () =>
  Effect.gen(function* () {
    const messages: Array<unknown> = []
    const client = HttpClient.make((request) =>
      Effect.fail(
        new HttpClientError.HttpClientError({
          reason: new HttpClientError.TransportError({
            request,
            cause: new Error(secret, { cause: new Error(secret) }),
          }),
        }),
      ),
    )
    const result = yield* Effect.gen(function* () {
      const exporter = yield* makeExporter({
        endpoint: "https://collector.example",
        headers: Redacted.make(`Authorization=Bearer ${secret}`),
      })
      exporter.offer(yield* decodeTelemetryRecord(record))
      yield* exporter.flush
      return 42
    }).pipe(
      Effect.scoped,
      Effect.provide(dependencies(client)),
      Effect.provide(
        Logger.layer([
          Logger.make((options) => {
            messages.push(options)
          }),
        ]),
      ),
      Effect.provideService(References.MinimumLogLevel, "Trace"),
    )
    expect(result).toBe(42)
    expect(messages).toEqual([])
  }),
)

it.effect(
  "classifies expected invalid messages as WARN, real failures as ERROR, and cancellation as INFO",
  () =>
    Effect.gen(function* () {
      const { requests, client } = recording()
      yield* Effect.gen(function* () {
        const exporter = yield* makeExporter({
          endpoint: "https://collector.example",
          headers: Redacted.make(""),
          traces: false,
        })
        for (const event of [
          { name: "host.invalid_message", outcome: "failure", failureTag: "invalidMessage" },
          { name: "host.failure", outcome: "failure", failureTag: "invalidMessage" },
          { name: "host.failure", outcome: "failure", failureTag: "javaScript" },
          { name: "host.disposed", outcome: "cancelled" },
        ]) {
          exporter.offer(
            yield* decodeTelemetryRecord({
              _tag: "Event",
              timestampUnixNano: "1794744000010000000",
              ...event,
            }),
          )
        }
        yield* exporter.flush
      }).pipe(Effect.scoped, Effect.provide(dependencies(client, OtlpSerialization.layerJson)))
      expect(requests).toHaveLength(1)
      for (const request of requests) {
        const payload: unknown = JSON.parse(new TextDecoder().decode(request.body))
        expect(payload).toMatchObject({
          resourceLogs: [
            {
              scopeLogs: [
                {
                  logRecords: [
                    { severityNumber: 13, severityText: "WARN" },
                    { severityNumber: 13, severityText: "WARN" },
                    { severityNumber: 17, severityText: "ERROR" },
                    { severityNumber: 9, severityText: "INFO" },
                  ],
                },
              ],
            },
          ],
        })
      }
    }),
)

it.effect(
  "honors only allowlisted percent-decoded resource environment and version attributes",
  () =>
    Effect.gen(function* () {
      const { requests, client } = recording()
      yield* Effect.gen(function* () {
        const exporter = yield* exporterFromConfig
        expect(exporter.enabled).toBe(true)
        exporter.offer(yield* decodeTelemetryRecord(record))
        yield* exporter.flush
      }).pipe(
        Effect.scoped,
        Effect.provideService(HttpClient.HttpClient, client),
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromUnknown({
            FOLDKIT_TELEMETRY_ENABLED: "true",
            OTEL_RESOURCE_ATTRIBUTES: `deployment.environment.name=local%2Dprobe,service.version=1.2.3%2Bbuild,private.input=${secret},service.name=${secret}`,
          }),
        ),
      )
      expect(requests).toHaveLength(2)
      for (const request of requests) {
        const text = new TextDecoder().decode(request.body)
        expect(text).toContain("local-probe")
        expect(text).toContain("1.2.3+build")
        expect(text).toContain("foldkit-native.apple-host")
        expect(text).not.toContain(secret)
        expect(text).not.toContain("private.input")
      }
    }),
)

it.effect("safely disables invalid resource configuration or unsupported protocol", () =>
  Effect.gen(function* () {
    const { requests, client } = recording()
    for (const config of [
      { OTEL_RESOURCE_ATTRIBUTES: "service.version=%invalid" },
      { OTEL_RESOURCE_ATTRIBUTES: `service.version=${"v".repeat(129)}` },
      { OTEL_RESOURCE_ATTRIBUTES: "x".repeat(2049) },
      { OTEL_EXPORTER_OTLP_PROTOCOL: "http/json" },
    ]) {
      yield* Effect.gen(function* () {
        const exporter = yield* exporterFromConfig
        expect(exporter.enabled).toBe(false)
        exporter.offer(yield* decodeTelemetryRecord(record))
        yield* exporter.flush
      }).pipe(
        Effect.scoped,
        Effect.provideService(HttpClient.HttpClient, client),
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromUnknown({
            FOLDKIT_TELEMETRY_ENABLED: "true",
            ...config,
          }),
        ),
      )
    }
    expect(requests).toEqual([])
  }),
)
