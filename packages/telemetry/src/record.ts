import { Schema } from "effect"

export const SpanName = Schema.Literals([
  "Counter.start",
  "Counter.dispatch",
  "Counter.command",
  "Counter.complete",
  "Counter.dispose",
  "DelayedIncrement",
])

export const MessageTag = Schema.Literals([
  "TappedIncrement",
  "TappedDelayedIncrement",
  "CompletedDelayedIncrement",
])

export const Outcome = Schema.Literals(["success", "failure", "cancelled"])
const isUnixNano = (value: string): boolean =>
  /^[0-9]{1,20}(?![\s\S])/.test(value) && BigInt(value) <= 18_446_744_073_709_551_615n

export const UnixNano = Schema.String.check(
  Schema.makeFilter(isUnixNano, { message: "Timestamp must be an unsigned 64-bit decimal string" }),
)
const traceId = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{32}(?![\s\S])/),
  Schema.makeFilter((value) => /[1-9a-f]/.test(value), { message: "Trace ID must be nonzero" }),
)
const spanId = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{16}(?![\s\S])/),
  Schema.makeFilter((value) => /[1-9a-f]/.test(value), { message: "Span ID must be nonzero" }),
)

export const TelemetryRecord = Schema.Union([
  Schema.TaggedStruct("Span", {
    name: SpanName,
    traceId,
    spanId,
    parentSpanId: Schema.optionalKey(spanId),
    startTimeUnixNano: UnixNano,
    endTimeUnixNano: UnixNano,
    outcome: Outcome,
    messageTag: Schema.optionalKey(MessageTag),
    commandName: Schema.optionalKey(Schema.Literal("DelayedIncrement")),
  }).check(
    Schema.makeFilter(
      (record) =>
        isUnixNano(record.startTimeUnixNano) &&
        isUnixNano(record.endTimeUnixNano) &&
        BigInt(record.endTimeUnixNano) >= BigInt(record.startTimeUnixNano),
      { message: "Span end timestamp must not precede its start timestamp" },
    ),
  ),
  Schema.TaggedStruct("Event", {
    name: Schema.Literals([
      "host.start",
      "host.started",
      "host.failure",
      "host.disposed",
      "host.invalid_message",
    ]),
    outcome: Outcome,
    timestampUnixNano: UnixNano,
    failureTag: Schema.optionalKey(
      Schema.Literals([
        "wrongThread",
        "unavailable",
        "disposed",
        "invalidLifecycle",
        "bundleRead",
        "javaScript",
        "invalidSnapshot",
        "invalidBridge",
        "invalidMessage",
      ]),
    ),
  }),
])

export type TelemetryRecord = typeof TelemetryRecord.Type

export const decodeTelemetryRecord = Schema.decodeUnknownEffect(TelemetryRecord, {
  onExcessProperty: "error",
})
