# Apple counter proof host

Standalone JavaScriptCore with a macOS command-line probe and UIKit iPhone app.
Both compile the same `Sources/HostRuntime` adapter. There is no React, React
Native, DOM, WebView, development server, or bundle reload.

## Bridge

The bundled IIFE installs `globalThis.FoldkitNativeCounter` with `start()`,
`dispatch(jsonString)`, and `dispose()`. Swift provides
`__foldkitRender(jsonString)`, `__foldkitLog(message)`, `setTimeout`, and
`clearTimeout`. Timers support callback arguments, are scheduled on the main
run loop, and are cancelled on disposal. All engine entrypoints reject use
outside the main thread. Host closures capture the adapter weakly.

The prelude also installs narrow UTF-8 `TextEncoder` and `TextDecoder` classes.
Encoding replaces lone UTF-16 surrogates and returns `Uint8Array`. Decoding
accepts `ArrayBuffer` and views with their exact byte ranges, supports fatal
validation versus Unicode replacement, and respects `ignoreBOM`. Native
Foundation/Swift converts actual UTF-8 bytes across a validated JSON boundary.
Only UTF-8 labels are supported. Streaming decoding is explicitly rejected;
`encodeInto`, other encodings, and full Web Encoding API conformance are not
implemented. Pure native encoding callbacks retain no runtime or JS context.

Snapshots contain exactly `{"count":0,"pending":0}`. Both fields must be
nonnegative JavaScript-safe integers. Native decodes them with strict `Codable`;
malformed snapshots report `invalidSnapshot`, without replacing the last valid
snapshot. `pending` counts active delayed commands.

Native events are `{"_tag":"TappedIncrement"}` and
`{"_tag":"TappedDelayedIncrement"}`. Malformed events are rejected by the
TypeScript decoder, leave state unchanged, and log `Invalid counter message`.
This bridge is counter-specific, not a general native rendering protocol.

Labels and buttons are created once. Subsequent renders update their text and
enabled state. A `UIWindowSceneDelegate` owns the window, controller, and runtime
for its scene. Scene disconnection explicitly disposes JS before releasing the
window/controller; reconnecting a disconnected scene creates a fresh runtime.
Ordinary foreground/background transitions do not reload the bundle. Adapter
destruction also invalidates remaining native timers. iOS process termination
does not guarantee a lifecycle callback. Background playback, background
execution guarantees, and persistence are not implemented.

## Build and probe on macOS

From the repository root, with Bun and the Xcode command-line tools available:

```sh
bun install
bun run build:counter
swift run --package-path native/apple HostProbe "$PWD/dist/counter.js"
```

The probe exits nonzero on failures. It checks real-host UTF-8 astral encoding
and decoding, lone-surrogate replacement, malformed strict/replacement decode,
buffer/view slicing, BOM handling, and explicit streaming rejection. It also
checks strict snapshot parsing, actual
render-boundary rejection, initial render, increment, pending state, async
completion with a five-second timeout, malformed-event rejection, continued
dispatch, no late renders after disposing a pending command, and a fresh runtime
returning to its initial snapshot without stale completion.

## Opt-in safe telemetry

Telemetry is disabled by default. With `FOLDKIT_TELEMETRY_STDOUT=1`, the host
installs the optional `__foldkitTelemetry(jsonString)` callback before evaluating
the bundle, and writes one-line records prefixed with `FOLDKIT_TELEMETRY `.
An Effect/Bun process can consume these records and own OTLP export. The native
app contains no collector credentials or exporter SDK.

```sh
FOLDKIT_TELEMETRY_STDOUT=1 swift run --package-path native/apple HostProbe "$PWD/dist/counter.js"
```

Swift independently parses callback JSON, rejecting non-string values, unknown
keys, records over 16 KiB of UTF-8, and fields outside the fixed wire contract:

- `Span`: `name` is `Counter.start`, `Counter.dispatch`, `Counter.command`,
  `Counter.complete`, `Counter.dispose`, or `DelayedIncrement`; lowercase
  nonzero 32-digit `traceId`, nonzero 16-digit `spanId`, optional nonzero
  16-digit `parentSpanId`;
  `startTimeUnixNano` and `endTimeUnixNano` are 1-20 decimal digit strings in
  `0...18446744073709551615`, with end greater than or equal to start;
  `outcome` is `success`, `failure`, or `cancelled`. Optional `messageTag` is
  one of the three counter tags; optional `commandName` is `DelayedIncrement`.
- `Event`: `name` is `host.start`, `host.started`, `host.failure`,
  `host.disposed`, or `host.invalid_message`; `outcome` uses the same three
  values; `timestampUnixNano` is a 1-20 decimal digit string in
  `0...18446744073709551615`. Optional
  `failureTag` is `wrongThread`, `unavailable`, `disposed`,
  `invalidLifecycle`, `bundleRead`, `javaScript`, `invalidSnapshot`,
  `invalidBridge`, or `invalidMessage`.

The host emits startup attempts before bundle loading, successful startup,
typed native failures, and disposal. Failure records contain only the actual
`CounterRuntimeError` tag, never its associated exception or path. Callback
payloads never contain model values, raw messages, configuration, or device
identifiers. `host.invalid_message` may be supplied by the TypeScript boundary
with the fixed `invalidMessage` tag; arbitrary logs are not exported.

Each `CounterRuntime` owns its telemetry transport. Dispatch I/O performs writes
off the UI thread, admits at most 128 outstanding records, and drops new records
when full. Invalid records are silently discarded. I/O failures drop records
without changing runtime results or recursively exporting failures. Queue overflow and
stdout/relay failures emit fixed local OSLog diagnostics, at most once per
runtime for each of those three categories. They never include payloads, URLs,
tokens, status values, or raw errors, and never use the telemetry callback or
exporter. Disabled telemetry emits no diagnostics. This is best-effort
diagnostic delivery, not an audit log or durable buffer.

Optional HTTP relay requires both `FOLDKIT_TELEMETRY_RELAY_URL` and
`FOLDKIT_TELEMETRY_SESSION_TOKEN`. The token must be an opaque, private per-run
value of 32-512 visible ASCII bytes without whitespace, never the shared
collector bearer. Each request is `POST application/json`, containing one safe
record directly, with `Authorization: Bearer <session token>`. Only HTTPS or
HTTP on `localhost`, `127.0.0.1`, or `::1` is accepted. URL user information,
query strings, fragments, and redirects are rejected. Invalid configuration
silently disables relay without printing any URL, token, or config value.
No network transport is enabled by default. Setting both opt-ins explicitly
enables both outputs under the same 128-record capacity.

The ephemeral URLSession disables cookies, credential storage, and cache;
requests time out after one second, with a 1.5-second resource deadline and no
application retries. Response bodies are discarded at headers instead of
buffered. Cancellation, HTTP failure, and exporter failure never affect the
counter result. Native code never reads desktop SOPS or Keychain configuration.
No ATS exceptions are added; platform policy may further restrict HTTP relay.
The loopback address refers to the current host, not a paired desktop when
running on a physical iPhone.

Explicit disposal closes admission and asynchronously drains transport work.
Shutdown cancels outstanding I/O after at most two seconds without blocking the
main thread. `shutdownTelemetry(completion:)` provides a main-queue completion
for lifecycle owners that need to observe the drain deadline. The CLI pumps its
run loop at exit to observe completion; UIKit disposal never waits on export.
Process termination and scene teardown do not guarantee delivery.
Abandoning a runtime without explicit disposal also initiates bounded telemetry
shutdown from `deinit`, breaking the relay session/delegate ownership cycle
without waiting on the UI thread or claiming successful JS disposal.

The probe additionally captures the real transport to local temporary files
and checks disabled/no-output behavior, exact valid-span forwarding, malformed
record rejection without affecting startup, secret-sentinel exclusion from raw
JavaScript failures, lifecycle events, and an unwritable exporter that must not
change the counter result. A 10,000-record flood into an unread pipe checks that
backpressure does not block counter startup and shutdown still meets its
deadline. These new checks require macOS execution; source
implementation alone does not establish a passing Apple build or probe.
Relay checks reject unsafe URL/auth configuration and exercise a refused
loopback connection without changing startup/disposal outcomes. The probe also
abandons a relay-enabled runtime without disposal and checks that the runtime
and telemetry transport are released within the shutdown budget. Successful
relay delivery, authentication, redirect refusal, and remote timeout behavior
still require an actual relay fixture or development-host integration check.
No instrumented build has been installed on the physical phone as part of this
work; macOS/simulator checks are not physical-device evidence.

## Generate and build the iPhone app

Install XcodeGen locally, then run from the repository root after bundling:

```sh
xcodegen generate --spec native/apple/project.yml
xcodebuild \
  -project native/apple/FoldkitNative.xcodeproj \
  -scheme FoldkitNative \
  -configuration Debug \
  -destination 'generic/platform=iOS' \
  -derivedDataPath native/apple/DerivedData \
  CODE_SIGNING_ALLOWED=NO build
```

For a signed device build, supply your local signing team through an environment
variable. Do not save it in `project.yml`:

```sh
xcodebuild \
  -project native/apple/FoldkitNative.xcodeproj \
  -scheme FoldkitNative \
  -configuration Debug \
  -destination 'generic/platform=iOS' \
  -derivedDataPath native/apple/DerivedData \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="$APPLE_DEVELOPMENT_TEAM" build
xcrun devicectl device install app \
  --device "$IPHONE_DEVICE" \
  native/apple/DerivedData/Build/Products/Debug-iphoneos/FoldkitNative.app
xcrun devicectl device process launch \
  --device "$IPHONE_DEVICE" \
  org.planetaryescape.foldkitnative
```

Device check: see `0` and `Ready`, tap Increment to see `1`, then tap Delayed
increment to see three seconds of progress and finally `2` and `Ready`. Tap
Increment while a delayed command is pending to check that interaction remains
responsive. Native
controls expose `counter.count`, `counter.status`, `counter.increment`, and
`counter.delayedIncrement` accessibility identifiers.

## Physical-device UI tests

The scheme is `FoldkitNative`; the UI test target is `FoldkitNativeUITests`.
The app targets iOS 16; UI tests target iOS 17 to match the newer XCTest SDK.
The three tests launch a fresh app and check immediate increment, delayed
pending/completion, and immediate increment rendering while a command is still
pending. All waits use bounded XCTest predicate expectations, without sleeps.
The responsiveness assertion intentionally requires observing pending state;
the final count alone is insufficient evidence.

```sh
mkdir -p .local/apple
xcodebuild \
  -project native/apple/FoldkitNative.xcodeproj \
  -scheme FoldkitNative \
  -configuration Debug \
  -destination "platform=iOS,id=$IPHONE_DEVICE" \
  -derivedDataPath native/apple/DerivedData \
  -resultBundlePath ".local/apple/CounterUITests-$(date +%Y%m%d-%H%M%S).xcresult" \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="$APPLE_DEVELOPMENT_TEAM" test
```

Successful tests attach screenshots to the local xcresult. Keep results,
exported screenshots, and diagnostics under the ignored `.local/` directory,
not in tracked documentation.

Generated Xcode projects, build products, signing data, and device identifiers
must remain local. Building the probe or app is not physical-device evidence.
This source was implemented on Linux; Apple build/runtime checks must be
performed separately and recorded by the session running them.
See the [implementation log](../../docs/implementation-log.md) for actual
checks, failed attempts, and the physical-device signing limitation.

## GUI-session device runner

When SSH signing fails because its Keychain session differs from the unlocked
desktop session, run Xcode through a transient LaunchAgent in the current user's
`gui/<uid>` launch domain. This does not unlock a Keychain, change its ACLs,
request passwords, or install a persistent agent.

On the Mac, log in to the desktop as the same user, unlock the login Keychain
through the normal desktop workflow, connect the trusted iPhone, and enable
Developer Mode. Xcode must already have the signing account configured.
From the repository root, generate the project and bundle before running:

```sh
bun run build:counter
xcodegen generate --spec native/apple/project.yml
export APPLE_DEVELOPMENT_TEAM='YOUR_TEAM_ID'
export IPHONE_DEVICE='YOUR_DEVICE_ID'
bun run scripts/apple-device.ts build-for-testing
bun run scripts/apple-device.ts test
```

`build-for-testing` builds signed test products; `test` builds and runs the full
UI suite and is the default when no mode is supplied. `build` is also accepted
as an alias for `build-for-testing`.
An optional second argument selects tests, for example
`FoldkitNativeUITests/CounterTests/testIncrement`. Use actual class and method
names from the test source. `test-without-building` reuses the previous runner
build in `.local/device-derived-data`; rebuild after source changes.
Do not run concurrent commands against that shared DerivedData directory.

Each invocation prints a unique local run directory under `.local/apple-device/`
containing `stdout.log`, `stderr.log`, an atomic `exit-status`, and the Xcode
result bundle when produced. Captured stdout/stderr and the result-bundle path
are printed after completion. Logs can contain signing and device identifiers:
inspect them locally, do not publish them. The runner reports the Xcode exit
status, fails on a nonzero status, and waits for filesystem completion events
with a 30-minute limit rather than polling.

On completion, failure, timeout, SIGINT, or SIGTERM, Effect scope cleanup boots
out only this invocation's job and removes its generated plist and wrapper.
Launchd owns the job's process group. No files are installed in
`~/Library/LaunchAgents`, and the job has no `KeepAlive`. A forced process kill,
machine crash, or inaccessible launch domain can prevent cleanup; the locally
reported job label can be removed with `launchctl bootout gui/<uid>/<label>`.
Retained logs, results, and DerivedData are deliberately local and ignored.
This runner is macOS-only; Linux checks do not verify GUI launch or signing.
