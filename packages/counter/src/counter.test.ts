import { expect, it } from "@effect/vitest"
import { Effect, Fiber, Result } from "effect"
import { TestClock } from "effect/testing"
import { decodeMessage, DelayedIncrement, initialModel, Message, update } from "./counter"

it.effect("starts with zero count and no pending work", () =>
  Effect.sync(() => {
    expect(initialModel()).toEqual({ count: 0, pending: 0 })
  }),
)

it.effect("decodes a native tap and increments without mutating the old model", () =>
  Effect.gen(function* () {
    const before = initialModel()
    const message = yield* decodeMessage({ _tag: "TappedIncrement" })
    const result = update(before, message)
    expect(result.model).toEqual({ count: 1, pending: 0 })
    expect(before).toEqual({ count: 0, pending: 0 })
    expect(result.commands ?? []).toEqual([])
  }),
)

it.effect("returns a named command and applies its delayed typed message", () =>
  Effect.gen(function* () {
    const before = initialModel()
    const waiting = update(before, Message.cases.TappedDelayedIncrement.make({}))
    expect(waiting.model).toEqual({ count: 0, pending: 1 })
    expect(before).toEqual({ count: 0, pending: 0 })
    expect(waiting.commands?.map((command) => command.name)).toEqual([DelayedIncrement.name])
    const command = waiting.commands?.[0]
    if (command === undefined) {
      return yield* Effect.die("Expected delayed increment command")
    }
    const fiber = yield* command.effect.pipe(Effect.forkScoped)
    yield* TestClock.adjust("499 millis")
    expect(fiber.pollUnsafe()).toBeUndefined()
    expect(waiting.model).toEqual({ count: 0, pending: 1 })
    yield* TestClock.adjust("1 millis")
    const message = yield* Fiber.join(fiber)
    expect(message).toEqual({ _tag: "CompletedDelayedIncrement" })
    const completed = update(waiting.model, message)
    expect(completed.model).toEqual({ count: 1, pending: 0 })
    expect(completed.commands ?? []).toEqual([])
  }),
)

it.effect("rejects malformed native events through the typed parse channel", () =>
  Effect.gen(function* () {
    for (const input of [null, "TappedIncrement", {}, { _tag: "Unknown" }]) {
      const result = yield* decodeMessage(input).pipe(Effect.result)
      expect(Result.isFailure(result)).toBe(true)
    }
  }),
)

it.effect("ignores a completion when no increment is pending", () =>
  Effect.sync(() => {
    const before = initialModel()
    const result = update(before, Message.cases.CompletedDelayedIncrement.make({}))
    expect(result.model).toEqual({ count: 0, pending: 0 })
    expect(result.commands ?? []).toEqual([])
  }),
)

it.effect("rejects unexpected fields on otherwise valid mutating messages", () =>
  Effect.gen(function* () {
    for (const _tag of ["TappedIncrement", "TappedDelayedIncrement", "CompletedDelayedIncrement"]) {
      const result = yield* decodeMessage({ _tag, unexpected: true }).pipe(Effect.result)
      expect(Result.isFailure(result)).toBe(true)
    }
  }),
)
