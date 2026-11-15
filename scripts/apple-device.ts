import { existsSync, watch } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { Cause, Config, Effect, Exit, Schema } from "effect"

class AppleDeviceFailed extends Schema.TaggedError<AppleDeviceFailed>()("AppleDeviceFailed", {
  detail: Schema.String,
}) {
  override get message() {
    return this.detail
  }
}

export const parseArguments = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const [mode = "test", selector, ...extra] = args
    if (
      (mode !== "build" &&
        mode !== "build-for-testing" &&
        mode !== "test" &&
        mode !== "test-without-building") ||
      extra.length > 0 ||
      (selector !== undefined && !/^FoldkitNativeUITests(?:\/[A-Za-z0-9_]+){0,2}$/.test(selector))
    ) {
      return yield* Effect.fail(
        new AppleDeviceFailed({
          detail:
            "Usage: bun run apple:device [build-for-testing|test|test-without-building] [FoldkitNativeUITests[/Class[/method]]]",
        }),
      )
    }
    return { action: mode === "build" ? "build-for-testing" : mode, selector }
  })

export const plistString = (value: string) =>
  `<string>${value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")}</string>`

const io = <A>(detail: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: () => new AppleDeviceFailed({ detail }),
  })

const launchctl = (args: ReadonlyArray<string>) =>
  Effect.tryPromise({
    try: async (signal) => {
      const child = Bun.spawn(["/bin/launchctl", ...args], {
        stdout: "pipe",
        stderr: "pipe",
        signal,
      })
      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ])
      return { code, stdout, stderr }
    },
    catch: () => new AppleDeviceFailed({ detail: "Unable to execute launchctl." }),
  }).pipe(Effect.timeout("30 seconds"))

export const waitForStatus = (directory: string) =>
  Effect.callback<string, AppleDeviceFailed>((resume) => {
    try {
      const status = join(directory, "exit-status")
      const complete = () =>
        resume(io("Unable to read the xcodebuild exit status.", () => readFile(status, "utf8")))
      const watcher = watch(directory, (_event, filename) => {
        if (filename === "exit-status") complete()
      })
      watcher.on("error", () =>
        resume(
          Effect.fail(new AppleDeviceFailed({ detail: "Unable to watch xcodebuild completion." })),
        ),
      )
      if (existsSync(status)) complete()
      return Effect.sync(() => watcher.close())
    } catch {
      resume(Effect.fail(new AppleDeviceFailed({ detail: "Unable to watch the run directory." })))
    }
  })

const wrapper = `#!/bin/bash
result="$1"
shift
"$@"
status=$?
printf '%s\\n' "$status" > "$result.tmp"
/bin/mv -f "$result.tmp" "$result"
exit "$status"
`

const run = Effect.gen(function* () {
  if (process.platform !== "darwin") {
    return yield* Effect.fail(
      new AppleDeviceFailed({
        detail: "This runner requires macOS, Xcode, and an active GUI login for the current user.",
      }),
    )
  }
  const uid = process.getuid?.()
  if (uid === undefined || uid === 0) {
    return yield* Effect.fail(
      new AppleDeviceFailed({ detail: "Run as the logged-in macOS user, without sudo." }),
    )
  }
  const { action, selector } = yield* parseArguments(process.argv.slice(2))
  const team = yield* Config.String("APPLE_DEVELOPMENT_TEAM")
  const device = yield* Config.String("IPHONE_DEVICE")
  if (!/^[A-Z0-9]{10}$/.test(team) || !/^[A-Za-z0-9-]+$/.test(device)) {
    return yield* Effect.fail(
      new AppleDeviceFailed({
        detail: "Set a valid APPLE_DEVELOPMENT_TEAM and physical IPHONE_DEVICE in the environment.",
      }),
    )
  }
  const root = process.cwd()
  const base = join(root, ".local/apple-device")
  const domain = `gui/${uid}`
  const gui = yield* launchctl(["print", domain])
  if (gui.code !== 0) {
    return yield* Effect.fail(
      new AppleDeviceFailed({
        detail: "No accessible GUI launch domain. Log in on the Mac first.",
      }),
    )
  }
  const project = join(root, "native/apple/FoldkitNative.xcodeproj")
  if (!existsSync(project)) {
    return yield* Effect.fail(
      new AppleDeviceFailed({
        detail: "Generate the project first: xcodegen generate --spec native/apple/project.yml",
      }),
    )
  }
  yield* io("Unable to create the local artifact directory.", () =>
    mkdir(base, { recursive: true, mode: 0o700 }),
  )
  const directory = yield* io("Unable to create the local run directory.", () =>
    mkdtemp(join(base, "run-")),
  )
  console.log(`Local run artifacts: ${directory}`)
  const label = `org.foldkit-native.apple-device.${crypto.randomUUID()}`
  const target = `${domain}/${label}`
  const plist = join(directory, "job.plist")
  const script = join(directory, "run.sh")
  yield* Effect.acquireRelease(Effect.succeed({ plist, script }), (files) =>
    io("Unable to remove temporary runner files.", async () => {
      await rm(files.plist, { force: true })
      await rm(files.script, { force: true })
    }).pipe(Effect.catch((error) => Effect.sync(() => console.error(error.detail)))),
  )
  const arguments_ = [
    "/bin/bash",
    script,
    join(directory, "exit-status"),
    "/usr/bin/xcodebuild",
    "-project",
    project,
    "-scheme",
    "FoldkitNative",
    "-configuration",
    "Debug",
    "-destination",
    `platform=iOS,id=${device}`,
    "-derivedDataPath",
    join(root, ".local/device-derived-data"),
    "-resultBundlePath",
    join(directory, "result.xcresult"),
    "-allowProvisioningUpdates",
    `DEVELOPMENT_TEAM=${team}`,
    ...(selector === undefined ? [] : [`-only-testing:${selector}`]),
    action,
  ]
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key>${plistString(label)}
<key>ProgramArguments</key><array>${arguments_.map(plistString).join("")}</array>
<key>WorkingDirectory</key>${plistString(root)}
<key>EnvironmentVariables</key><dict>
<key>HOME</key>${plistString(homedir())}
<key>PATH</key>${plistString("/usr/bin:/bin:/usr/sbin:/sbin")}
</dict>
<key>StandardOutPath</key>${plistString(join(directory, "stdout.log"))}
<key>StandardErrorPath</key>${plistString(join(directory, "stderr.log"))}
<key>RunAtLoad</key><true/>
<key>AbandonProcessGroup</key><false/>
<key>ExitTimeOut</key><integer>10</integer>
</dict></plist>
`
  yield* io("Unable to write temporary runner files.", async () => {
    await writeFile(script, wrapper, { mode: 0o600 })
    await writeFile(plist, content, { mode: 0o600 })
  })
  yield* Effect.acquireUseRelease(
    Effect.succeed(target),
    () =>
      Effect.gen(function* () {
        const launched = yield* launchctl(["bootstrap", domain, plist])
        if (launched.code !== 0) {
          return yield* Effect.fail(
            new AppleDeviceFailed({
              detail: `GUI job bootstrap failed (${launched.code}). Check GUI-session access and local launchctl diagnostics.`,
            }),
          )
        }
        const status = yield* waitForStatus(directory).pipe(Effect.timeout("30 minutes"))
        yield* io("Unable to read captured xcodebuild output.", async () => {
          const stdout = await readFile(join(directory, "stdout.log"), "utf8")
          const stderr = await readFile(join(directory, "stderr.log"), "utf8")
          process.stdout.write(stdout)
          process.stderr.write(stderr)
        })
        const code = yield* Schema.decodeUnknownEffect(Schema.NumberFromString)(status.trim()).pipe(
          Effect.filterOrFail(
            (value) => Number.isInteger(value) && value >= 0 && value <= 255,
            () => new AppleDeviceFailed({ detail: "Invalid xcodebuild exit status." }),
          ),
        )
        console.log(
          `xcodebuild exit status: ${code}. stdout.log, stderr.log and results remain local.`,
        )
        console.log(`Local result bundle (if produced): ${join(directory, "result.xcresult")}`)
        if (code !== 0) {
          return yield* Effect.fail(
            new AppleDeviceFailed({
              detail: `xcodebuild failed (${code}); inspect the local run logs.`,
            }),
          )
        }
      }),
    (job) =>
      launchctl(["bootout", job]).pipe(
        Effect.flatMap((result) =>
          result.code === 0
            ? Effect.void
            : Effect.fail(
                new AppleDeviceFailed({
                  detail: `Transient job cleanup failed (${result.code}); run launchctl bootout ${job} locally.`,
                }),
              ),
        ),
      ),
  )
})

if (import.meta.main) {
  const controller = new AbortController()
  const interrupt = () => controller.abort()
  process.once("SIGINT", interrupt)
  process.once("SIGTERM", interrupt)
  const exit = await Effect.runPromiseExit(Effect.scoped(run), { signal: controller.signal })
  process.removeListener("SIGINT", interrupt)
  process.removeListener("SIGTERM", interrupt)
  if (Exit.isFailure(exit)) {
    console.error(Cause.pretty(exit.cause))
    process.exitCode = 1
  }
}
