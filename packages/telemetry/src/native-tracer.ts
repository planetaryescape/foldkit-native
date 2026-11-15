import { Cause, Exit, Option, Result, Schema, Tracer } from "effect"
import { MessageTag, SpanName, TelemetryRecord } from "./record"

declare global {
  var __foldkitTelemetry: ((jsonString: string) => void) | undefined
}

const decodeRecord = Schema.decodeUnknownResult(TelemetryRecord, { onExcessProperty: "error" })
const decodeName = Schema.decodeUnknownResult(SpanName)
const decodeMessageTag = Schema.decodeUnknownResult(MessageTag)

export const emitTelemetryRecord = (record: TelemetryRecord): void => {
  try {
    const decoded = decodeRecord(record)
    if (Result.isSuccess(decoded)) {
      globalThis.__foldkitTelemetry?.(JSON.stringify(decoded.success))
    }
  } catch {
    return
  }
}

export const nativeTracer = Tracer.make({
  span(options) {
    const span = Tracer.nativeTracer.span(options)
    return {
      _tag: span._tag,
      name: span.name,
      get traceId() {
        return span.traceId
      },
      get spanId() {
        return span.spanId
      },
      parent: span.parent,
      annotations: span.annotations,
      get status() {
        return span.status
      },
      get attributes() {
        return span.attributes
      },
      get links() {
        return span.links
      },
      sampled: span.sampled,
      kind: span.kind,
      attribute: (key, value) => span.attribute(key, value),
      event: (name, time, attributes) => span.event(name, time, attributes),
      addLinks: (links) => span.addLinks(links),
      end(time, exit) {
        if (span.status._tag === "Ended") return
        span.end(time, exit)
        const name = decodeName(span.name)
        if (!span.sampled || Result.isFailure(name)) return
        const parent = Option.getOrUndefined(span.parent)
        const messageTag = decodeMessageTag(span.attributes.get("messageTag"))
        let outcome: typeof TelemetryRecord.Type.outcome = "success"
        if (Exit.isFailure(exit)) {
          outcome = Cause.hasInterruptsOnly(exit.cause) ? "cancelled" : "failure"
        }
        emitTelemetryRecord({
          _tag: "Span",
          name: name.success,
          traceId: span.traceId,
          spanId: span.spanId,
          ...(parent === undefined ? {} : { parentSpanId: parent.spanId }),
          startTimeUnixNano: options.startTime.toString(),
          endTimeUnixNano: time.toString(),
          outcome,
          ...(Result.isSuccess(messageTag) ? { messageTag: messageTag.success } : {}),
          ...(span.attributes.get("commandName") === "DelayedIncrement"
            ? { commandName: "DelayedIncrement" }
            : {}),
        })
      },
    }
  },
})
