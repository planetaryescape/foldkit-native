import { emitTelemetryRecord, nativeTracer } from "@foldkit-native/telemetry/native-tracer"
import { Clock, Effect, Result, Schema, Tracer } from "effect"
import type { Fiber } from "effect"
import type * as Command from "foldkit/command"
import { initialModel, Message, update } from "./counter"
import type { Model } from "./counter"

interface NativeCounter {
  readonly start: () => void
  readonly dispatch: (jsonString: string) => void
  readonly dispose: () => void
}

declare global {
  var FoldkitNativeCounter: NativeCounter | undefined
  var __foldkitRender: (jsonString: string) => void
  var __foldkitLog: ((message: string) => void) | undefined
}

const decodeJsonMessage = Schema.decodeUnknownResult(Schema.fromJsonString(Message), {
  onExcessProperty: "error",
})
let model: Model = initialModel()
let active = false
let generation = 0
const fibers = new Set<Fiber.Fiber<void>>()

const render = (): void => {
  globalThis.__foldkitRender(JSON.stringify(model))
}

const accept = (message: Message, parent: Tracer.AnySpan): void => {
  const result = update(model, message)
  model = result.model
  render()
  for (const command of result.commands ?? []) execute(command, parent)
}

const execute = (command: Command.Command<Message>, parent: Tracer.AnySpan): void => {
  const startedIn = generation
  const fiber = Effect.runFork(
    command.effect.pipe(
      Effect.withSpan(command.name, { attributes: { commandName: command.name } }),
      Effect.flatMap((message) =>
        Effect.gen(function* () {
          const completion = yield* Effect.currentSpan.pipe(Effect.orDie)
          if (active && generation === startedIn) accept(message, completion)
        }).pipe(
          Effect.withSpan("Counter.complete", {
            attributes: { messageTag: message._tag, commandName: "DelayedIncrement" },
          }),
        ),
      ),
      Effect.tapCause(() =>
        Effect.sync(() => {
          if (active && generation === startedIn) {
            globalThis.__foldkitLog?.("Counter command failed")
          }
        }),
      ),
      Effect.withSpan("Counter.command", { attributes: { commandName: "DelayedIncrement" } }),
      Effect.withParentSpan(parent),
      Effect.provideService(Tracer.Tracer, nativeTracer),
    ),
  )
  fibers.add(fiber)
  fiber.addObserver(() => fibers.delete(fiber))
}

const release = (): void => {
  active = false
  generation += 1
  for (const fiber of fibers) fiber.interruptUnsafe()
  fibers.clear()
}

const dispose = (): void =>
  Effect.runSync(
    Effect.sync(release).pipe(
      Effect.withSpan("Counter.dispose"),
      Effect.provideService(Tracer.Tracer, nativeTracer),
    ),
  )

const start = (): void =>
  Effect.runSync(
    Effect.sync(() => {
      release()
      model = initialModel()
      active = true
      render()
    }).pipe(Effect.withSpan("Counter.start"), Effect.provideService(Tracer.Tracer, nativeTracer)),
  )

const dispatch = (jsonString: string): void => {
  if (!active) return
  const decoded = decodeJsonMessage(jsonString)
  if (Result.isFailure(decoded)) {
    globalThis.__foldkitLog?.("Invalid counter message")
    Effect.runSync(
      Effect.gen(function* () {
        const timestamp = yield* Clock.currentTimeNanos
        emitTelemetryRecord({
          _tag: "Event",
          name: "host.invalid_message",
          outcome: "failure",
          timestampUnixNano: timestamp.toString(),
          failureTag: "invalidMessage",
        })
      }),
    )
    return
  }
  Effect.runSync(
    Effect.gen(function* () {
      const parent = yield* Effect.currentSpan.pipe(Effect.orDie)
      accept(decoded.success, parent)
    }).pipe(
      Effect.withSpan("Counter.dispatch", { attributes: { messageTag: decoded.success._tag } }),
      Effect.provideService(Tracer.Tracer, nativeTracer),
    ),
  )
}

globalThis.FoldkitNativeCounter?.dispose()
globalThis.FoldkitNativeCounter = { start, dispatch, dispose }
