import { Cause, Effect, Exit, Schema } from "effect"

class CounterBuildFailed extends Schema.TaggedError<CounterBuildFailed>()("CounterBuildFailed", {
  detail: Schema.String,
}) {}

const build = Effect.gen(function* () {
  const result = yield* Effect.tryPromise({
    try: () =>
      Bun.build({
        entrypoints: ["packages/counter/src/native.ts"],
        outdir: "dist",
        naming: "counter.[ext]",
        target: "browser",
        format: "iife",
        sourcemap: "external",
      }),
    catch: (cause) => new CounterBuildFailed({ detail: String(cause) }),
  })

  if (!result.success) {
    return yield* Effect.fail(
      new CounterBuildFailed({
        detail: result.logs.map((entry) => entry.message).join("\n"),
      }),
    )
  }

  console.log("Built dist/counter.js for the standalone JavaScriptCore host.")
})

const exit = await Effect.runPromiseExit(build)
if (Exit.isFailure(exit)) {
  console.error(Cause.pretty(exit.cause))
  process.exitCode = 1
}
