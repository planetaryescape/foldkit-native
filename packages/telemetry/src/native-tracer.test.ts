import { expect, it } from "@effect/vitest"
import { Cause, Effect, Exit, Fiber, Option, Schema, Tracer } from "effect"
import { nativeTracer } from "./native-tracer"
import { TelemetryRecord } from "./record"

const capture = Effect.gen(function* () {
  const previous = globalThis.__foldkitTelemetry
  const serialized: string[] = []
  globalThis.__foldkitTelemetry = (json) => serialized.push(json)
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      globalThis.__foldkitTelemetry = previous
    }),
  )
  const records = () =>
    serialized.map((json) => Schema.decodeUnknownSync(Schema.fromJsonString(TelemetryRecord))(json))
  return { serialized, records }
})

it.effect("exports Effect span identity and parentage across separate runtime entry points", () =>
  Effect.gen(function* () {
    const host = yield* capture
    let child: Fiber.Fiber<void> | undefined
    const parent = yield* Effect.gen(function* () {
      const parent = yield* Effect.currentSpan
      child = Effect.runFork(
        Effect.void.pipe(
          Effect.withSpan("Counter.command"),
          Effect.withParentSpan(parent),
          Effect.provideService(Tracer.Tracer, nativeTracer),
        ),
      )
      return parent
    }).pipe(
      Effect.withSpan("Counter.dispatch", { attributes: { messageTag: "TappedDelayedIncrement" } }),
      Effect.provideService(Tracer.Tracer, nativeTracer),
    )
    if (child !== undefined) yield* Fiber.join(child)
    const records = host.records()
    const dispatch = records.find((record) => record.name === "Counter.dispatch")
    const command = records.find((record) => record.name === "Counter.command")
    expect(dispatch).toMatchObject({
      _tag: "Span",
      traceId: parent.traceId,
      spanId: parent.spanId,
      outcome: "success",
      messageTag: "TappedDelayedIncrement",
    })
    expect(command).toMatchObject({
      _tag: "Span",
      traceId: parent.traceId,
      parentSpanId: parent.spanId,
      outcome: "success",
    })
    expect(records).toHaveLength(2)
  }).pipe(Effect.scoped),
)

it.effect(
  "exports only safe fields without automatic nested exception, event, or link payloads",
  () =>
    Effect.gen(function* () {
      const host = yield* capture
      const secret = "synthetic-private-token-DO-NOT-EXPORT"
      const failure = new Error("outer", {
        cause: new Error(secret, { cause: { input: secret, url: `https://invalid/${secret}` } }),
      })
      const exit = yield* Effect.gen(function* () {
        const span = yield* Effect.currentSpan
        span.event("exception", 1n, { "exception.message": secret, stack: secret })
        span.addLinks([
          {
            span: Tracer.externalSpan({
              traceId: "0123456789abcdef0123456789abcdef",
              spanId: "0123456789abcdef",
            }),
            attributes: { secret },
          },
        ])
        return yield* Effect.fail(failure)
      }).pipe(
        Effect.withSpan("Counter.command", {
          attributes: {
            messageTag: "TappedDelayedIncrement",
            commandName: "DelayedIncrement",
            model: { token: secret },
            input: secret,
            exception: failure,
            url: secret,
          },
        }),
        Effect.provideService(Tracer.Tracer, nativeTracer),
        Effect.exit,
      )
      expect(Exit.isFailure(exit)).toBe(true)
      const records = host.records()
      expect(records).toHaveLength(1)
      expect(records[0]).toMatchObject({
        name: "Counter.command",
        outcome: "failure",
        messageTag: "TappedDelayedIncrement",
        commandName: "DelayedIncrement",
      })
      expect(host.serialized.join("")).not.toContain(secret)
      expect(Object.keys(records[0] ?? {}).sort()).toEqual([
        "_tag",
        "commandName",
        "endTimeUnixNano",
        "messageTag",
        "name",
        "outcome",
        "spanId",
        "startTimeUnixNano",
        "traceId",
      ])
    }).pipe(Effect.scoped),
)

it.effect("drops unapproved span names and unapproved attribute values", () =>
  Effect.gen(function* () {
    const host = yield* capture
    yield* Effect.void.pipe(
      Effect.withSpan("unapproved"),
      Effect.provideService(Tracer.Tracer, nativeTracer),
    )
    yield* Effect.void.pipe(
      Effect.withSpan("Counter.start", {
        attributes: { messageTag: "secret", commandName: "secret" },
      }),
      Effect.provideService(Tracer.Tracer, nativeTracer),
    )
    expect(host.records()).toHaveLength(1)
    expect(host.serialized.join("")).not.toContain("secret")
    expect(host.serialized.join("")).not.toContain("unapproved")
  }).pipe(Effect.scoped),
)

it.effect("records pure interruption as cancellation", () =>
  Effect.gen(function* () {
    const host = yield* capture
    const exit = yield* Effect.interrupt.pipe(
      Effect.withSpan("Counter.command"),
      Effect.provideService(Tracer.Tracer, nativeTracer),
      Effect.exit,
    )
    expect(Exit.isFailure(exit)).toBe(true)
    expect(host.records()).toMatchObject([{ name: "Counter.command", outcome: "cancelled" }])
  }).pipe(Effect.scoped),
)

it.effect("missing or throwing host callbacks preserve the operation result", () =>
  Effect.gen(function* () {
    yield* capture
    const run = Effect.succeed(42).pipe(
      Effect.withSpan("Counter.start"),
      Effect.provideService(Tracer.Tracer, nativeTracer),
    )
    globalThis.__foldkitTelemetry = undefined
    expect(yield* run).toBe(42)
    globalThis.__foldkitTelemetry = () => {
      throw new Error("host callback failed")
    }
    expect(yield* run).toBe(42)
    const exit = yield* Effect.fail("original failure").pipe(
      Effect.withSpan("Counter.command"),
      Effect.provideService(Tracer.Tracer, nativeTracer),
      Effect.exit,
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(Cause.findErrorOption(exit.cause)).toEqual(Option.some("original failure"))
    }
  }).pipe(Effect.scoped),
)
