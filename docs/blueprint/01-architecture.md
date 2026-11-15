# 01: Architecture

Status: proposed mechanisms implementing owner-accepted goals, with counter-host implementation in progress. The minimal project-owned runner is accepted. No native behavior is verified here.

## Runtime boundary

```text
native control event
  -> decoded application message
  -> project-owned experimental native runner
  -> application update using public Foldkit command/update APIs
  -> Effect command execution owned by our runner
  -> native view projection / asynchronous result message
```

This flow does not use Foldkit's browser lifecycle/message runner or assert that its renderer is replaceable. The bounded proof of concept reuses public command/update APIs from Foldkit 0.170.0 with Effect 4.1.4; our minimal experimental runner owns processing and command-effect execution. Public import compatibility is being checked. Record the exact reuse demonstrated by implementation, without claiming complete Foldkit runtime compatibility.

If upstream lacks a suitable public runtime hook, record the extraction gap for later. That does not block the counter-host proof of concept. Do not copy upstream internals to fill the gap.

## Ownership and invariants

| Owner                      | Responsibility                                                              | Boundary                                                         |
| -------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Foldkit application        | Model, messages, transitions, command intent                                | Public APIs verified against the pinned dependency               |
| Experimental native runner | Message processing, update invocation, command execution, session lifecycle | Project-owned bounded implementation, not upstream runtime reuse |
| Effect runtime             | TypeScript services, asynchronous execution, cancellation, typed failures   | Composed at the application entrypoint                           |
| JavaScript engine host     | Engine lifetime, callback scheduling, timers, bundle evaluation             | Native embedding adapter, engine not yet selected                |
| Native binding             | Native views, event conversion, UI-thread dispatch, resource release        | Explicit supported operations, not arbitrary object access       |
| Development host           | Session lifetime, bundle loading, diagnostics, compatibility checks         | Versioned host and bundle contract                               |
| Developer tooling          | Bundle production and development connection                                | Bun workflow with Effect-owned TypeScript orchestration          |

Native view changes occur on the platform UI thread. The engine's execution context owns JavaScript entry; callbacks cross through its scheduler. Serialized events and bundle metadata are parsed before application use, with Effect Schema on TypeScript boundaries and native validation before native dispatch.

Expected decode, loading, compatibility, and command failures remain distinguishable. Native or engine defects surface as diagnostic failures, not successful application messages. Commands never block the UI thread.

## First consumer: counter

Proposed usage is intentionally behavioral rather than an invented API:

1. Define a counter model, increment message, and asynchronous command outcome messages through verified Foldkit public APIs.
2. Compose the required Effect services at startup.
3. Let the native host load the bundled application and create native text and button controls.
4. Convert button events into application messages and project resulting model state back to native controls.
5. Start an asynchronous command, keep native interaction responsive, and deliver its result or typed failure to the application.
6. Tear down the application and release callbacks, work, engine resources, and native views.

The first milestone requires demonstrated public Foldkit command/update reuse, our runner executing command effects, and physical iPhone execution. Upstream lifecycle/message-runner reuse is not required and is not claimed. A pure transition test, desktop bundle import, simulator screenshot, or Swift-only counter is insufficient.

## Reusable development host

Accepted workflow; transport and protocol shape proposed:

```text
Effect-based local tooling -> bundle + compatibility metadata
  -> installed native host -> validate handshake -> start application session
  <- structured logs and errors <- running session
```

The compatibility handshake should identify protocol version, native capability/runtime version, bundle identity, and required capabilities. Reject incompatible bundles before execution and explain what must be rebuilt. These are proposed fields, not a published wire format.

For reload, validate the replacement, close the old session, interrupt its owned Effect work, detach native callbacks, then start a fresh session. Late results from the previous session must not change the new model or views. State preservation is not required. Report loading and startup failures visibly; do not promise rollback until implemented.

Logs and errors identify their session and source, including bundle loading, decoding, application failures, and engine defects. Keep public evidence redacted and avoid exposing arbitrary remote code loading. Begin with an explicit, trusted local development connection.

The host is reusable only within its compiled native capabilities. Bundle-only changes should not require a native rebuild; adding bindings or changing the native contract does. Expo Go cannot load this custom native runtime. EAS build/distribution may be evaluated separately and is not required for initial local proof.

## Lifecycle beyond the counter

- **Searchable list:** native text input emits queries; application state owns filtering/results; native list bindings preserve item identity and selection.
- **Scoped screen work:** entering a screen acquires its Effect scope; leaving interrupts screen-owned work and releases native subscriptions. Late results cannot update a closed screen.
- **Background audio:** a native audio service owns playback and platform session lifecycle. Background behavior cannot depend on JavaScript timers continuing to run. Define interruption, permission, and remote-control behavior before implementation.

## Source ownership

Paths are confirmed by the implementation owner. Responsibilities below describe the intended boundary, not verified native behavior:

| Path               | Intended responsibility                                             |
| ------------------ | ------------------------------------------------------------------- |
| `packages/counter` | First application, real upstream integration, and behavioral checks |
| `native/apple`     | Apple host, JavaScript engine embedding, and native bindings        |
| `scripts`          | Effect-based developer orchestration and compatibility probes       |

A shared engine package or framework extraction is deferred until working slices justify it.

## Verification boundary

Test transitions and command outcomes through public module boundaries. Exercise real engine/native seams for event delivery, asynchronous completion, malformed inputs, teardown, and reload. Physical-device evidence must name the source revision, dependency/engine versions, build mode, steps, observed behavior, and limitations without private device details.

Decisions: [D001](02-decision-log.md#d001-use-real-upstream-foldkit), [D002](02-decision-log.md#d002-native-ui-and-effect-typescript), [D003](02-decision-log.md#d003-reusable-development-host), [D004](02-decision-log.md#d004-prove-ios-before-platform-expansion), [D005](02-decision-log.md#d005-select-the-engine-through-evidence).
