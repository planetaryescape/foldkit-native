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
