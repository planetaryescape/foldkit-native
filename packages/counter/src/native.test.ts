import { readFile } from "node:fs/promises"
import { TextDecoder, TextEncoder } from "node:util"
import { runInNewContext } from "node:vm"
import { expect, it } from "@effect/vitest"
import { Effect } from "effect"

interface Bridge {
  readonly start: () => void
  readonly dispatch: (jsonString: string) => void
  readonly dispose: () => void
}

interface Timer {
  readonly callback: () => void
  readonly delay: number
}

const makeHost = Effect.gen(function* () {
  const source = yield* Effect.tryPromise(() =>
    readFile(new URL("../../../dist/counter.js", import.meta.url), "utf8"),
  )
  const renders: string[] = []
  const logs: string[] = []
  const timers = new Map<number, Timer>()
  let nextTimer = 0
  const sandbox: {
    FoldkitNativeCounter: Bridge | undefined
    __foldkitRender: (json: string) => void
    __foldkitLog: (message: string) => void
    TextEncoder: typeof TextEncoder
    TextDecoder: typeof TextDecoder
    setTimeout: (callback: () => void, delay?: number) => number
    clearTimeout: (id: number) => void
  } = {
    FoldkitNativeCounter: undefined,
    __foldkitRender: (json) => renders.push(json),
    __foldkitLog: (message) => logs.push(message),
    TextEncoder,
    TextDecoder,
    setTimeout: (callback, delay = 0) => {
      const id = ++nextTimer
      timers.set(id, { callback, delay })
      return id
    },
    clearTimeout: (id) => {
      timers.delete(id)
    },
  }

  const evaluate = (): Bridge => {
    runInNewContext(source, sandbox, { timeout: 1_000 })
    const bridge = sandbox.FoldkitNativeCounter
    if (bridge === undefined) throw new Error("Bundle did not install the native counter")
    return bridge
  }

  const drain = (): Effect.Effect<void, Error> =>
    Effect.tryPromise(async () => {
      for (let turn = 0; turn < 100; turn += 1) {
        await new Promise<void>((resolve) => setImmediate(resolve))
        const next = timers.entries().next()
        if (next.done) return
        const [id, timer] = next.value
        timers.delete(id)
        timer.callback()
      }
      throw new Error("Native counter did not settle within 100 host timer turns")
    })

  const bridge = evaluate()
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      sandbox.FoldkitNativeCounter?.dispose()
      timers.clear()
    }),
  )

  return { bridge, evaluate, renders, logs, timers, drain }
})

it.live("rejects malformed JSON, null, unknown tags, and excess fields without rendering", () =>
  Effect.gen(function* () {
    const host = yield* makeHost
    host.bridge.start()
    const invalid = [
      "{",
      "null",
      JSON.stringify({ _tag: "Unknown" }),
      ...["TappedIncrement", "TappedDelayedIncrement", "CompletedDelayedIncrement"].map((_tag) =>
        JSON.stringify({ _tag, unexpected: true }),
      ),
    ]
    for (const json of invalid) host.bridge.dispatch(json)
    yield* host.drain()
    expect(host.renders).toEqual(['{"count":0,"pending":0}'])
    expect(host.logs).toEqual(invalid.map(() => "Invalid counter message"))
    expect(host.timers.size).toBe(0)
  }).pipe(Effect.scoped, Effect.timeout("5 seconds")),
)

it.live("disposal cancels pending timers and ignores subsequent dispatch", () =>
  Effect.gen(function* () {
    const host = yield* makeHost
    host.bridge.start()
    host.bridge.dispatch('{"_tag":"TappedDelayedIncrement"}')
    expect(Array.from(host.timers.values(), (timer) => timer.delay)).toEqual([500])
    host.bridge.dispose()
    expect(host.timers.size).toBe(0)
    host.bridge.dispatch('{"_tag":"TappedIncrement"}')
    host.bridge.dispatch('{"_tag":"TappedDelayedIncrement"}')
    yield* host.drain()
    expect(host.renders).toEqual(['{"count":0,"pending":0}', '{"count":0,"pending":1}'])
    expect(host.logs).toEqual([])
    expect(host.timers.size).toBe(0)
  }).pipe(Effect.scoped, Effect.timeout("5 seconds")),
)

it.live("restart in the same global cancels old work and starts a fresh usable session", () =>
  Effect.gen(function* () {
    const host = yield* makeHost
    host.bridge.start()
    host.bridge.dispatch('{"_tag":"TappedDelayedIncrement"}')
    const oldTimers = Array.from(host.timers.values())
    expect(oldTimers.map((timer) => timer.delay)).toEqual([500])
    host.bridge.start()
    expect(host.timers.size).toBe(0)
    for (const timer of oldTimers) timer.callback()
    yield* host.drain()
    expect(host.renders).toEqual([
      '{"count":0,"pending":0}',
      '{"count":0,"pending":1}',
      '{"count":0,"pending":0}',
    ])
    host.bridge.dispatch('{"_tag":"TappedDelayedIncrement"}')
    yield* host.drain()
    expect(host.renders.slice(-2)).toEqual(['{"count":0,"pending":1}', '{"count":1,"pending":0}'])
    expect(host.logs).toEqual([])
    expect(host.timers.size).toBe(0)
  }).pipe(Effect.scoped, Effect.timeout("5 seconds")),
)

it.live("reevaluating the bundle disposes the previous global counter and its pending work", () =>
  Effect.gen(function* () {
    const host = yield* makeHost
    host.bridge.start()
    host.bridge.dispatch('{"_tag":"TappedDelayedIncrement"}')
    const oldTimers = Array.from(host.timers.values())
    expect(oldTimers.map((timer) => timer.delay)).toEqual([500])
    const replacement = host.evaluate()
    expect(replacement).not.toBe(host.bridge)
    expect(host.timers.size).toBe(0)
    replacement.start()
    host.bridge.dispatch('{"_tag":"TappedIncrement"}')
    for (const timer of oldTimers) timer.callback()
    yield* host.drain()
    expect(host.renders).toEqual([
      '{"count":0,"pending":0}',
      '{"count":0,"pending":1}',
      '{"count":0,"pending":0}',
    ])
    replacement.dispatch('{"_tag":"TappedIncrement"}')
    expect(host.renders.at(-1)).toBe('{"count":1,"pending":0}')
    expect(host.logs).toEqual([])
    expect(host.timers.size).toBe(0)
  }).pipe(Effect.scoped, Effect.timeout("5 seconds")),
)

it.live("runs both returned commands when two delayed increments are pending", () =>
  Effect.gen(function* () {
    const host = yield* makeHost
    host.bridge.start()
    host.bridge.dispatch('{"_tag":"TappedDelayedIncrement"}')
    host.bridge.dispatch('{"_tag":"TappedDelayedIncrement"}')
    expect(Array.from(host.timers.values(), (timer) => timer.delay)).toEqual([500, 500])
    yield* host.drain()
    expect(host.renders).toEqual([
      '{"count":0,"pending":0}',
      '{"count":0,"pending":1}',
      '{"count":0,"pending":2}',
      '{"count":1,"pending":1}',
      '{"count":2,"pending":0}',
    ])
    expect(host.logs).toEqual([])
    expect(host.timers.size).toBe(0)
  }).pipe(Effect.scoped, Effect.timeout("5 seconds")),
)
