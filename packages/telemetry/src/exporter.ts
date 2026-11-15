import { Config, Effect, Layer, Logger, Option, Redacted, Schema, Semaphore } from "effect"
import { HttpClient } from "effect/http"
import { OtlpExporter, OtlpResource, OtlpSerialization } from "effect/observability"
import type { LogsData } from "effect/observability/OtlpLogger"
import type { TraceData } from "effect/observability/OtlpTracer"
import type { TelemetryRecord } from "./record"

export interface ExporterOptions {
  readonly endpoint: string
  readonly headers: Redacted.Redacted<string>
  readonly tracesEndpoint?: string | undefined
  readonly logsEndpoint?: string | undefined
  readonly traces?: boolean | undefined
  readonly logs?: boolean | undefined
  readonly serviceName?: string | undefined
  readonly serviceVersion?: string | undefined
  readonly environment?: string | undefined
}

export interface TelemetryExporter {
  readonly enabled: boolean
  readonly offer: (record: TelemetryRecord) => void
  readonly flush: Effect.Effect<void>
}

class InvalidTelemetryConfiguration extends Schema.TaggedError<InvalidTelemetryConfiguration>()(
  "InvalidTelemetryConfiguration",
  {},
) {}

const noop: TelemetryExporter = { enabled: false, offer: () => {}, flush: Effect.void }
const attribute = (key: string, value: string) => ({ key, value: { stringValue: value } })
const scope = { name: "foldkit-native", version: "0.0.0" }

const span = (record: Extract<TelemetryRecord, { readonly _tag: "Span" }>) => {
  const attributes = [attribute("foldkit.outcome", record.outcome)]
  if (record.messageTag !== undefined) {
    attributes.push(attribute("foldkit.message_tag", record.messageTag))
  }
  if (record.commandName !== undefined) {
    attributes.push(attribute("foldkit.command_name", record.commandName))
  }
  return {
    traceId: record.traceId,
    spanId: record.spanId,
    parentSpanId: record.parentSpanId,
    name: record.name,
    kind: 1,
    startTimeUnixNano: record.startTimeUnixNano,
    endTimeUnixNano: record.endTimeUnixNano,
    attributes,
    droppedAttributesCount: 0,
    events: [],
    droppedEventsCount: 0,
    links: [],
    droppedLinksCount: 0,
    status: { code: record.outcome === "failure" ? 2 : 1 },
  }
}

const logSeverity = (
  record: TelemetryRecord,
): { readonly severityNumber: 9 | 13 | 17; readonly severityText: "INFO" | "WARN" | "ERROR" } => {
  if (
    record._tag === "Event" &&
    (record.name === "host.invalid_message" || record.failureTag === "invalidMessage")
  ) {
    return { severityNumber: 13, severityText: "WARN" }
  }
  if (record.outcome === "failure") return { severityNumber: 17, severityText: "ERROR" }
  return { severityNumber: 9, severityText: "INFO" }
}

const log = (
  record: TelemetryRecord,
): NonNullable<LogsData["resourceLogs"][number]["scopeLogs"][number]["logRecords"]>[number] => {
  const timestamp = record._tag === "Span" ? record.endTimeUnixNano : record.timestampUnixNano
  const attributes = [attribute("foldkit.outcome", record.outcome)]
  if (record._tag === "Event" && record.failureTag !== undefined) {
    attributes.push(attribute("foldkit.failure_tag", record.failureTag))
  }
  return {
    timeUnixNano: timestamp,
    observedTimeUnixNano: timestamp,
    ...logSeverity(record),
    body: { stringValue: record.name },
    attributes,
    droppedAttributesCount: 0,
    ...(record._tag === "Span" ? { traceId: record.traceId, spanId: record.spanId } : {}),
  }
}

const parseTransport = (options: ExporterOptions) =>
  Effect.try({
    try: () => {
      const endpoint = (value: string) => {
        const url = new URL(value)
        const local = url.hostname === "127.0.0.1" || url.hostname === "localhost"
        if (
          (url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
          url.username !== "" ||
          url.password !== "" ||
          url.search !== "" ||
          url.hash !== ""
        ) {
          throw new InvalidTelemetryConfiguration()
        }
        return url.toString().replace(/\/$/, "")
      }
      const base = endpoint(options.endpoint)
      const headers: Record<string, string> = {}
      const raw = Redacted.value(options.headers)
      for (const entry of raw === "" ? [] : raw.split(",")) {
        const separator = entry.indexOf("=")
        if (separator < 1) throw new InvalidTelemetryConfiguration()
        const name = entry.slice(0, separator).trim()
        const value = decodeURIComponent(entry.slice(separator + 1).trim())
        if (!/^[a-zA-Z0-9-]+$/.test(name) || /[\r\n]/.test(value)) {
          throw new InvalidTelemetryConfiguration()
        }
        headers[name] = value
      }
      return {
        traces:
          options.tracesEndpoint === undefined
            ? `${base}/v1/traces`
            : endpoint(options.tracesEndpoint),
        logs:
          options.logsEndpoint === undefined ? `${base}/v1/logs` : endpoint(options.logsEndpoint),
        headers,
      }
    },
    catch: () => new InvalidTelemetryConfiguration(),
  })

export const makeExporter = (options: ExporterOptions) =>
  Effect.gen(function* () {
    const transport = yield* parseTransport(options)
    const serialization = yield* OtlpSerialization.OtlpSerialization
    const flusher = yield* OtlpExporter.Flusher
    const resource = OtlpResource.make({
      serviceName: options.serviceName ?? "foldkit-native.apple-host",
      serviceVersion: options.serviceVersion ?? "0.0.0",
      attributes: { "deployment.environment.name": options.environment ?? "local" },
    })
    let warned = false
    const warn = () => {
      if (warned) return
      warned = true
      console.error("Foldkit telemetry unavailable; records may be dropped.")
    }
    const client = yield* HttpClient.HttpClient
    const safeClient = client.pipe(
      HttpClient.filterStatusOk,
      HttpClient.tapError(() => Effect.sync(warn)),
    )
    const traceExporter =
      options.traces === false
        ? undefined
        : yield* OtlpExporter.make({
            url: transport.traces,
            headers: transport.headers,
            label: "FoldkitNativeTraces",
            exportInterval: "1 hour",
            maxBatchSize: "disabled",
            shutdownTimeout: "100 millis",
            body: (
              items: Array<
                TraceData["resourceSpans"][number]["scopeSpans"][number]["spans"][number]
              >,
            ) => [
              serialization.traces({
                resourceSpans: [{ resource, scopeSpans: [{ scope, spans: items }] }],
              }),
              Effect.void,
            ],
          }).pipe(Effect.provideService(HttpClient.HttpClient, safeClient))
    const logExporter =
      options.logs === false
        ? undefined
        : yield* OtlpExporter.make({
            url: transport.logs,
            headers: transport.headers,
            label: "FoldkitNativeLogs",
            exportInterval: "1 hour",
            maxBatchSize: "disabled",
            shutdownTimeout: "100 millis",
            body: (
              items: NonNullable<
                LogsData["resourceLogs"][number]["scopeLogs"][number]["logRecords"]
              >,
            ) => [
              serialization.logs({
                resourceLogs: [{ resource, scopeLogs: [{ scope, logRecords: items }] }],
              }),
              Effect.void,
            ],
          }).pipe(Effect.provideService(HttpClient.HttpClient, safeClient))
    const pending: Array<TelemetryRecord> = []
    const semaphore = yield* Semaphore.make(1)
    const drain = Effect.gen(function* () {
      while (pending.length > 0) {
        const batch = pending.splice(0, 64)
        for (const record of batch) {
          if (record._tag === "Span") traceExporter?.push(span(record))
          logExporter?.push(log(record))
        }
        yield* flusher.flush
      }
    })
    const flush = drain.pipe(
      semaphore.withPermits(1),
      Effect.interruptible,
      Effect.timeoutOption("2500 millis"),
      Effect.flatMap((result) =>
        Effect.sync(() => {
          if (Option.isNone(result)) {
            pending.length = 0
            warn()
          }
        }),
      ),
      Effect.catchCause(() => Effect.sync(warn)),
      Effect.provide(Logger.layer([])),
    )
    yield* Effect.addFinalizer(() => flush)
    yield* Effect.forever(Effect.sleep("1 second").pipe(Effect.andThen(flush))).pipe(
      Effect.forkScoped,
    )
    return {
      enabled: options.traces !== false || options.logs !== false,
      offer: (record: TelemetryRecord) => {
        if (pending.length >= 256) {
          warn()
          return
        }
        pending.push(record)
      },
      flush,
    } satisfies TelemetryExporter
  }).pipe(Effect.provide(Logger.layer([])))

const optionalString = (name: string) => Config.String(name).pipe(Config.withDefault(""))

const resourceAttributes = (input: string) =>
  Effect.try({
    try: () => {
      if (input.length > 2048) throw new InvalidTelemetryConfiguration()
      let environment: string | undefined
      let serviceVersion: string | undefined
      for (const entry of input === "" ? [] : input.split(",")) {
        const separator = entry.indexOf("=")
        const key = entry.slice(0, separator).trim()
        if (key !== "deployment.environment.name" && key !== "service.version") continue
        const value = decodeURIComponent(entry.slice(separator + 1).trim())
        if (!/^[A-Za-z0-9][A-Za-z0-9._+/-]{0,127}$/.test(value)) {
          throw new InvalidTelemetryConfiguration()
        }
        if (key === "deployment.environment.name") environment = value
        if (key === "service.version") serviceVersion = value
      }
      return { environment, serviceVersion }
    },
    catch: () => new InvalidTelemetryConfiguration(),
  })

export const exporterFromConfig = Effect.gen(function* () {
  const enabled = yield* Config.Boolean("FOLDKIT_TELEMETRY_ENABLED").pipe(Config.withDefault(false))
  if (!enabled) return noop
  const disabled = yield* Config.Boolean("OTEL_SDK_DISABLED").pipe(Config.withDefault(false))
  if (disabled) return noop
  const endpoint = yield* Config.String("OTEL_EXPORTER_OTLP_ENDPOINT").pipe(
    Config.withDefault("https://otel.planetaryescape.co.za"),
  )
  const protocol = yield* Config.String("OTEL_EXPORTER_OTLP_PROTOCOL").pipe(
    Config.withDefault("http/protobuf"),
  )
  const traces = yield* Config.String("OTEL_TRACES_EXPORTER").pipe(Config.withDefault("otlp"))
  const logs = yield* Config.String("OTEL_LOGS_EXPORTER").pipe(Config.withDefault("otlp"))
  if (
    protocol !== "http/protobuf" ||
    !["otlp", "none"].includes(traces) ||
    !["otlp", "none"].includes(logs)
  ) {
    return yield* Effect.fail(new InvalidTelemetryConfiguration())
  }
  const headers = yield* Config.Redacted("OTEL_EXPORTER_OTLP_HEADERS").pipe(
    Config.withDefault(Redacted.make("")),
  )
  const serviceName = yield* Config.String("OTEL_SERVICE_NAME").pipe(
    Config.withDefault("foldkit-native.apple-host"),
  )
  const tracesEndpoint = yield* optionalString("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT")
  const logsEndpoint = yield* optionalString("OTEL_EXPORTER_OTLP_LOGS_ENDPOINT")
  const attributes = yield* optionalString("OTEL_RESOURCE_ATTRIBUTES").pipe(
    Effect.flatMap(resourceAttributes),
  )
  return yield* makeExporter({
    endpoint,
    headers,
    serviceName,
    environment: attributes.environment,
    serviceVersion: attributes.serviceVersion,
    traces: traces !== "none",
    logs: logs !== "none",
    tracesEndpoint: tracesEndpoint || undefined,
    logsEndpoint: logsEndpoint || undefined,
  })
}).pipe(
  Effect.provide(Layer.merge(OtlpSerialization.layerProtobuf, OtlpExporter.layerFlusher)),
  Effect.catchCause(() =>
    Effect.sync(() => {
      console.error("Foldkit telemetry configuration unavailable; export disabled.")
      return noop
    }),
  ),
)
