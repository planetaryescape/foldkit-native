import { Effect, Result, Schema } from "effect"
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

const accept = (message: Message): void => {
  const result = update(model, message)
  model = result.model
  render()
  for (const command of result.commands ?? []) execute(command)
}

const execute = (command: Command.Command<Message>): void => {
  const startedIn = generation
  const fiber = Effect.runFork(
    command.effect.pipe(
      Effect.flatMap((message) =>
        Effect.sync(() => {
          if (active && generation === startedIn) accept(message)
        }),
      ),
      Effect.tapCause(() =>
        Effect.sync(() => {
          if (active && generation === startedIn) {
            globalThis.__foldkitLog?.("Counter command failed")
          }
        }),
      ),
    ),
  )
  fibers.add(fiber)
  fiber.addObserver(() => fibers.delete(fiber))
}

const dispose = (): void => {
  active = false
  generation += 1
  for (const fiber of fibers) fiber.interruptUnsafe()
  fibers.clear()
}

const start = (): void => {
  dispose()
  model = initialModel()
  active = true
  render()
}

const dispatch = (jsonString: string): void => {
  if (!active) return
  const decoded = decodeJsonMessage(jsonString)
  if (Result.isFailure(decoded)) {
    globalThis.__foldkitLog?.("Invalid counter message")
    return
  }
  accept(decoded.success)
}

globalThis.FoldkitNativeCounter?.dispose()
globalThis.FoldkitNativeCounter = { start, dispatch, dispose }
