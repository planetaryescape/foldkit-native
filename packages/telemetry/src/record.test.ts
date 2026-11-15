import { expect, it } from "@effect/vitest"
import { Effect, Result, Schema } from "effect"
import { decodeTelemetryRecord, TelemetryRecord } from "./record"

const span = {
  _tag: "Span",
  name: "Counter.dispatch",
  traceId: "0123456789abcdef0123456789abcdef",
  spanId: "0123456789abcdef",
  startTimeUnixNano: "1794744000000000000",
  endTimeUnixNano: "1794744000001000000",
  outcome: "success",
  messageTag: "TappedIncrement",
}

it.effect("decodes the shared native span and event contracts", () =>
  Effect.gen(function* () {
    expect(yield* decodeTelemetryRecord(span)).toEqual(span)
    const event = {
      _tag: "Event",
      name: "host.failure",
      outcome: "failure",
      timestampUnixNano: "1794744000000000000",
      failureTag: "javaScript",
    }
    expect(yield* decodeTelemetryRecord(event)).toEqual(event)
  }),
)

it.effect(
  "rejects unapproved fields, names, identifiers, attributes, and unbounded timestamps",
  () =>
    Effect.sync(() => {
      const decode = Schema.decodeUnknownResult(TelemetryRecord, { onExcessProperty: "error" })
      for (const invalid of [
        { ...span, input: "secret" },
        { ...span, name: "private.dynamic.operation" },
        { ...span, messageTag: "Unknown" },
        { ...span, commandName: "Unknown" },
        { ...span, traceId: "ABCDEF0123456789ABCDEF0123456789" },
        { ...span, spanId: "short" },
        { ...span, spanId: "0123456789abcdef\n" },
        { ...span, parentSpanId: "short" },
        { ...span, startTimeUnixNano: "-1" },
        { ...span, startTimeUnixNano: "1\n" },
        { ...span, endTimeUnixNano: "1".repeat(21) },
        {
          _tag: "Event",
          name: "host.failure",
          outcome: "failure",
          timestampUnixNano: "1",
          failureTag: "arbitrary exception",
        },
        {
          _tag: "Event",
          name: "host.failure",
          outcome: "failure",
          timestampUnixNano: "1",
          stack: "secret",
        },
      ]) {
        expect(Result.isFailure(decode(invalid)), JSON.stringify(invalid)).toBe(true)
      }
    }),
)

it.effect("rejects all-zero trace, span, and parent span identifiers", () =>
  Effect.gen(function* () {
    for (const invalid of [
      { ...span, traceId: "0".repeat(32) },
      { ...span, spanId: "0".repeat(16) },
      { ...span, parentSpanId: "0".repeat(16) },
    ]) {
      const result = yield* decodeTelemetryRecord(invalid).pipe(Effect.result)
      expect(Result.isFailure(result)).toBe(true)
    }
  }),
)

it.effect("rejects unsigned 64-bit overflow and malformed timestamps without defects", () =>
  Effect.gen(function* () {
    for (const timestamp of [
      "18446744073709551616",
      "99999999999999999999",
      "100000000000000000000",
      "",
      "-1",
      "1.5",
      "1e3",
      "0x10",
      "1\n",
      "not a timestamp",
    ]) {
      for (const invalid of [
        { ...span, startTimeUnixNano: timestamp },
        { ...span, endTimeUnixNano: timestamp },
        {
          _tag: "Event",
          name: "host.started",
          outcome: "success",
          timestampUnixNano: timestamp,
        },
      ]) {
        const result = yield* decodeTelemetryRecord(invalid).pipe(Effect.result)
        expect(Result.isFailure(result)).toBe(true)
      }
    }
  }),
)

it.effect("rejects reversed span timestamps by numeric value", () =>
  Effect.gen(function* () {
    for (const invalid of [
      { ...span, startTimeUnixNano: "10", endTimeUnixNano: "9" },
      { ...span, startTimeUnixNano: "00000000000000000010", endTimeUnixNano: "9" },
      {
        ...span,
        startTimeUnixNano: "18446744073709551615",
        endTimeUnixNano: "18446744073709551614",
      },
    ]) {
      const result = yield* decodeTelemetryRecord(invalid).pipe(Effect.result)
      expect(Result.isFailure(result)).toBe(true)
    }
  }),
)

it.effect("preserves string timestamps at unsigned 64-bit boundaries and permits equal times", () =>
  Effect.gen(function* () {
    for (const valid of [
      { ...span, startTimeUnixNano: "0", endTimeUnixNano: "0" },
      { ...span, startTimeUnixNano: "9", endTimeUnixNano: "10" },
      { ...span, startTimeUnixNano: "00000000000000000010", endTimeUnixNano: "10" },
      {
        ...span,
        traceId: "00000000000000000000000000000001",
        spanId: "0000000000000001",
        parentSpanId: "0000000000000002",
        startTimeUnixNano: "18446744073709551615",
        endTimeUnixNano: "18446744073709551615",
      },
      {
        _tag: "Event",
        name: "host.started",
        outcome: "success",
        timestampUnixNano: "18446744073709551615",
      },
    ]) {
      expect(yield* decodeTelemetryRecord(valid)).toEqual(valid)
    }
  }),
)
