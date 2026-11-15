# First upstream Foldkit reuse experiment

Inspected 2026-11-15. This is an independent experiment, not an upstream native renderer or proof that the Foldkit browser runtime is portable.

## Published dependency evidence

The [Foldkit 0.170.0 registry manifest](https://registry.npmjs.org/foldkit/0.170.0) exports `foldkit/command` and `foldkit/update`. It declares peers `effect ~4.1.0` and `@effect/platform-browser ~4.1.0`, and a direct dependency on `parse5 ^8.0.1`.

This experiment pins `foldkit 0.170.0` and `effect 4.1.4`. Root tooling pins `@effect/vitest 4.1.4` and `vitest 5.1.0`. The [testing integration manifest](https://registry.npmjs.org/@effect%2fvitest/4.1.4) is the authority for its Effect/Vitest peer ranges. Installing a browser-platform peer to satisfy package metadata does not mean the counter imports or executes that platform.

Sources: the [published Foldkit archive](https://registry.npmjs.org/foldkit/-/foldkit-0.170.0.tgz), [Effect 4.1.4 manifest](https://registry.npmjs.org/effect/4.1.4), and [published Effect archive](https://registry.npmjs.org/effect/-/effect-4.1.4.tgz). Published files, rather than the moving upstream main branch, establish the API audited here.

## Actual application reuse

`packages/counter/src/counter.ts` imports only:

- `effect`: schema-decoded messages and a delayed Effect.
- `foldkit/command`: `Command.define` constructs the named `DelayedIncrement` command.
- `foldkit/update`: `Update.Return` and `Update.Step` specify transition contracts; `Update.combine` composes completion steps at runtime.

The command's public `effect` field produces `CompletedDelayedIncrement` after 500ms. This is a real upstream Command, not an application-created imitation. Update remains pure and does not run the command. Model changes allocate new records.

The counter does **not** import Foldkit runtime, mount, HTML, DOM, rendering, subscriptions, scene tests, React, or React Native. It does not import upstream private paths. Inspecting upstream implementation files for evidence does not make those paths supported application imports.

## Published public-entry import graph

Inspection of static JavaScript imports and re-exports in the published archive found:

```text
foldkit/command -> dist/command/public.js
  -> command/index.js
     -> effect
     -> command/brand.js
     -> command/interruptible/index.js
        -> command/interruptible/interruptible.js
           -> effect
           -> schema/index.js -> effect
           -> command/brand.js
  -> command/interruptible/public.js
     -> command/interruptible/index.js

foldkit/update -> dist/update/public.js
  -> update/index.js
     -> update/update.js
        -> effect
        -> command/index.js
```

This is the Foldkit-side JavaScript graph before bundler tree shaking. The Effect root import has its own graph; this audit does not claim that every Effect export is executed or portable. Type declarations also mention other modules, for example AsyncData in update declarations, without adding that module to the executed JavaScript graph.

No browser-global references were found in those Foldkit implementation modules. This observation supports trying this narrow seam, not claiming package-wide compatibility.

In particular, `foldkit/subscription` publicly re-exports `animationFrameEntry` from `dist/subscription/animationFrame.js`. That implementation uses `performance.now`, `requestAnimationFrame`, and `cancelAnimationFrame` when its stream runs. The browser dependency is real even though it is deferred until execution. The browser-oriented Foldkit runtime has not been made renderer-independent by avoiding that export.

## Native bridge contract

Bundle `packages/counter/src/native.ts` as a side-effect IIFE. It installs:

```text
globalThis.FoldkitNativeCounter.start(): void
globalThis.FoldkitNativeCounter.dispatch(jsonString: string): void
globalThis.FoldkitNativeCounter.dispose(): void
```

The native host provides `globalThis.__foldkitRender(jsonString)` and optionally `globalThis.__foldkitLog(message)`. Render payloads contain `count` and `pending`, initially `{"count":0,"pending":0}`. Messages are JSON objects with one of these tags:

| `_tag`                      | Behavior                                          |
| --------------------------- | ------------------------------------------------- |
| `TappedIncrement`           | Increment count immediately                       |
| `TappedDelayedIncrement`    | Increment pending and return one command          |
| `CompletedDelayedIncrement` | Consume one pending increment and increment count |

Completions with no pending work are ignored. A completion tag is accepted for this trusted experimental host; this is not a security boundary against a malicious host or a correlated request protocol.

The bridge decodes JSON and the message schema before updating state. Both core and JSON-boundary decoders use `onExcessProperty: "error"` to reject unexpected fields rather than silently discarding them. Malformed JSON, unknown message shapes, or excess fields produce a fixed safe diagnostic and no transition. Core unknown-input decoding exposes Effect's typed Schema error channel. Synchronous host render exceptions escape the host boundary; asynchronous command/render defects remain failed fiber outcomes. The runner taps command causes for a fixed diagnostic without recovering failure or interruption, and suppresses that diagnostic for stale or disposed sessions.

The bridge has a **counter-specific experimental runner**, not a general framework runtime. It runs the documented Command effect using Effect, tracks fibers, and calls the public fiber `interruptUnsafe` hook at the synchronous disposal boundary. This immediate hook fits the required synchronous JavaScript host API; it is not a claim of awaited asynchronous finalization. The only command currently owns a cancellable sleep. A generation guard prevents late old-session results from rendering after restart; completed fibers remove themselves from the set. Loading a replacement entry disposes the prior global counter.

No Foldkit browser-runtime scheduling, rendering, reconciliation, subscriptions, interrupt registry, managed resources, or devtools behavior is reused. The initial milestone's public-runtime-seam question therefore remains open beyond this narrower command/update experiment.

## Engine assumptions and evidence limits

Effect 4.1.4's `dist/internal/effect.js` implements sleep with `setTimeout` and `clearTimeout`. Its `dist/Scheduler.js` uses a Promise microtask path and a timer path; if `setImmediate` exists, the host must also support `clearImmediate`. The clock supports a `performance.now` path with a fallback. An embedded JavaScript engine alone is not enough: the host must supply functioning timers, cancellation, and asynchronous job execution. Installing DOM shims is neither required by this Foldkit seam nor a substitute for engine tests.

The core Effect-aware tests cover initial state, decoded tap input, immutable transitions, the real returned command, virtual time before and at completion, malformed input, excess fields on each message variant, and unsolicited completion. These checks are JavaScript behavior evidence, not Apple JavaScriptCore, simulator, native-view, physical-device, background execution, or reload-finalization proof.

Native-engine probe, compiled bundle, native build, and device results belong in the implementation log only after those checks actually run. No physical-device or compiled-native success is claimed here.
