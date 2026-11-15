import { mkdtemp, rename, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Fiber } from "effect"
import { parseArguments, plistString, waitForStatus } from "./apple-device"

describe("Apple device runner boundaries", () => {
  it.effect("maps build to build-for-testing and preserves a test selector", () =>
    Effect.gen(function* () {
      expect(
        yield* parseArguments(["build", "FoldkitNativeUITests/CounterTests/testIncrement"]),
      ).toEqual({
        action: "build-for-testing",
        selector: "FoldkitNativeUITests/CounterTests/testIncrement",
      })
      expect(yield* parseArguments(["test"])).toEqual({
        action: "test",
        selector: undefined,
      })
      expect(yield* parseArguments(["test-without-building"])).toEqual({
        action: "test-without-building",
        selector: undefined,
      })
      expect(yield* parseArguments(["build-for-testing"])).toEqual({
        action: "build-for-testing",
        selector: undefined,
      })
      expect(yield* parseArguments([])).toEqual({
        action: "test",
        selector: undefined,
      })
    }),
  )

  it.effect("rejects unsupported modes, selectors and extra arguments", () =>
    Effect.gen(function* () {
      for (const args of [
        ["archive"],
        ["test", "-allowSomething"],
        ["test", "FoldkitNativeUITests", "extra"],
      ]) {
        expect(yield* Effect.isFailure(parseArguments(args))).toBe(true)
      }
    }),
  )

  it("escapes XML without changing shell-significant text", () => {
    expect(plistString(`a<&>"' $HOME; $(touch nope)`)).toBe(
      "<string>a&lt;&amp;&gt;&quot;&apos; $HOME; $(touch nope)</string>",
    )
  })

  it.live("observes an atomically published status and a preexisting status", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* Effect.acquireRelease(
          Effect.promise(() => mkdtemp(join(tmpdir(), "apple-device-test-"))),
          (path) => Effect.promise(() => rm(path, { recursive: true, force: true })),
        )
        const pending = yield* waitForStatus(directory).pipe(
          Effect.timeout("5 seconds"),
          Effect.forkScoped,
        )
        yield* Effect.promise(async () => {
          await writeFile(join(directory, "exit-status.tmp"), "65\n")
          await rename(join(directory, "exit-status.tmp"), join(directory, "exit-status"))
        })
        expect(yield* Fiber.join(pending)).toBe("65\n")
        expect(yield* waitForStatus(directory)).toBe("65\n")
      }),
    ),
  )
})
