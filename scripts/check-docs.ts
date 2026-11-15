import { stat } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { Cause, Effect, Exit, Schema } from "effect"

class DocumentationCheckFailed extends Schema.TaggedError<DocumentationCheckFailed>()(
  "DocumentationCheckFailed",
  { detail: Schema.String },
) {}

const check = Effect.gen(function* () {
  const paths = ["README.md", "AGENTS.md"]
  const documentation = yield* Effect.tryPromise({
    try: () => Array.fromAsync(new Bun.Glob("docs/**/*.md").scan()),
    catch: (cause) => new DocumentationCheckFailed({ detail: String(cause) }),
  })
  paths.push(...documentation)

  const missing: string[] = []
  for (const path of paths) {
    const content = yield* Effect.tryPromise({
      try: () => Bun.file(path).text(),
      catch: (cause) => new DocumentationCheckFailed({ detail: String(cause) }),
    })

    for (const match of content.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const href = match[1]
      if (!href || /^(?:[a-z][a-z\d+.-]*:|#|\/)/i.test(href)) continue
      const destination = href.split("#")[0]
      if (!destination) continue

      const target = yield* Effect.try({
        try: () => resolve(dirname(path), decodeURIComponent(destination)),
        catch: (cause) => new DocumentationCheckFailed({ detail: String(cause) }),
      })
      const exists = yield* Effect.tryPromise({
        try: () => stat(target),
        catch: (cause) => new DocumentationCheckFailed({ detail: String(cause) }),
      }).pipe(Effect.result)

      if (exists._tag === "Failure") missing.push(`${path}: ${href}`)
    }
  }

  if (missing.length > 0) {
    return yield* Effect.fail(new DocumentationCheckFailed({ detail: missing.join("\n") }))
  }

  console.log(`Checked relative links in ${paths.length} Markdown files.`)
})

const exit = await Effect.runPromiseExit(check)
if (Exit.isFailure(exit)) {
  console.error(Cause.pretty(exit.cause))
  process.exitCode = 1
}
