import { Effect, Schema } from "effect"
import * as Command from "foldkit/command"
import * as Update from "foldkit/update"

export interface Model {
  readonly count: number
  readonly pending: number
}

export const Message = Schema.TaggedUnion({
  TappedIncrement: {},
  TappedDelayedIncrement: {},
  CompletedDelayedIncrement: {},
})

export type Message = typeof Message.Type

export const decodeMessage = Schema.decodeUnknownEffect(Message, { onExcessProperty: "error" })

export const initialModel = (): Model => ({ count: 0, pending: 0 })

export const DelayedIncrement = Command.define("DelayedIncrement", {
  messages: [Message.cases.CompletedDelayedIncrement],
  execute: Effect.sleep("500 millis").pipe(
    Effect.as(Message.cases.CompletedDelayedIncrement.make({})),
  ),
})

const increment: Update.Step<Model, Message> = (model) => ({
  model: { ...model, count: model.count + 1 },
})

export const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match(message, {
    TappedIncrement: () => increment(model),
    TappedDelayedIncrement: () => ({
      model: { ...model, pending: model.pending + 1 },
      commands: [DelayedIncrement()],
    }),
    CompletedDelayedIncrement: () => {
      if (model.pending === 0) return { model }
      return Update.combine(model, [
        (current) => ({
          model: { ...current, pending: current.pending - 1 },
        }),
        increment,
      ])
    },
  })
