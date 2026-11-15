# Implementation plan

Status: M01 complete for the bounded counter proof; later milestones planned. Completion evidence lives in the implementation log, not this checklist.

Follow the [blueprint](blueprint/README.md). Confirmed source paths are `packages/counter`, `native/apple`, and `scripts`. Dependency pins are Foldkit 0.170.0 and Effect 4.1.4. Record actual results and source revisions separately in `docs/implementation-log.md`; do not mark completion from this checklist alone.

## M01: Foldkit counter on a physical iPhone

Status: complete for the bounded counter proof. Physical-device UI verification and the shared-host explicit disposal probe passed. Graceful UIKit scene disconnection/reconnection remains outside direct device-test coverage. Depends on [D001](blueprint/02-decision-log.md#d001-use-real-upstream-foldkit), [D002](blueprint/02-decision-log.md#d002-native-ui-and-effect-typescript), and engine evidence under [D005](blueprint/02-decision-log.md#d005-select-the-engine-through-evidence). See [physical-device evidence](implementation-log.md#2026-11-15-physical-iphone-counter-verification).

Scope:

- Use Foldkit 0.170.0 and Effect 4.1.4; inspect public exports and verify the command/update APIs used by the counter without DOM assumptions.
- Implement our minimal experimental runner for message processing and command-effect execution, without copying upstream internals.
- Probe an embedded engine with the required asynchronous execution and host facilities.
- Connect native text/button controls to the counter model and a visible asynchronous command outcome.

Acceptance:

- A physical iPhone runs the bundled TypeScript application using real public Foldkit command/update APIs and our native runner, without React, React Native, DOM, or copied runtime internals.
- Native button presses change the model and visible count. An asynchronous command shows progress and success or a typed failure while interaction remains responsive.
- Closing the application session releases owned work and callbacks.

Checks: public-API compatibility probe, transition/command behavior checks, real engine/native event and teardown checks, physical-device demonstration. Capture dependency versions, source revision, and limitations without identifiers.

Reuse boundary: our runner owns lifecycle/message execution; upstream browser-runtime reuse and complete runtime compatibility are not claimed. Missing public runtime hooks are later extraction gaps, not blockers to this bounded proof of concept. Desktop tests and native scaffolding are partial evidence only.

## M01V: Express the native counter view in TypeScript

Status: planned. Depends on M01. This closes the gap between hosting Foldkit
application logic and expressing native UI from TypeScript.

Scope: a small native view vocabulary for containers, text, and buttons; a
schema-decoded view description; and native identity-preserving updates.
This is a new native target, not interpretation of Foldkit's HTML VNodes.

Acceptance: change the counter's text, control structure, or button action in
TypeScript and observe the corresponding native UI after rebuilding the
application bundle. Swift supplies platform primitives rather than a
counter-specific screen layout. Existing controls retain identity across
model updates.

Checks: malformed view descriptions, event-to-message routing, real native
updates, keyboard/accessibility implications as primitives expand, and
physical-device behavior. Do not call the fixed UIKit counter a general
Foldkit native renderer.

## M02: Reusable development host

Status: planned. Depends on M01, M01V, and [D003](blueprint/02-decision-log.md#d003-reusable-development-host).

Scope: Effect-based bundle tooling, trusted local connection, compatibility handshake, explicit reload, and host/application diagnostics.

Acceptance:

- Install the host once; change counter TypeScript, load a new compatible bundle, and observe the change on the same physical iPhone without rebuilding native code.
- Show bundle/session identity, application logs, and readable loading/runtime errors.
- Reject incompatible protocol/native capability requirements before execution.
- Reload cancels old work, releases old callbacks, and prevents late results from affecting the replacement session.

Checks: malformed/incompatible metadata, failed bundle loading, runtime failure display, repeated reload, and an asynchronous completion racing reload. Native binding changes explicitly require a rebuild. State-preserving hot reload and EAS integration are excluded.

## M03: Searchable native list

Status: planned. Depends on M02.

Scope: native search input and list controls backed by application-owned query, result, and selection state.

Acceptance: typing filters visible rows; clearing restores them; item identity and selection remain coherent across updates; empty results are visible. Native scrolling, accessibility, and UI responsiveness are exercised on device.

Checks: query/result behavior through public boundaries, real native event delivery and list updates, repeated bundle reload. Use this second consumer to evaluate extraction under [D006](blueprint/02-decision-log.md#d006-extract-only-after-working-slices), not to assume it.

## M04: Screen-scoped asynchronous work

Status: planned. Depends on M03.

Scope: a second screen with owned asynchronous work and native subscriptions.

Acceptance: entering starts work; leaving interrupts it and releases subscriptions; late results cannot update the closed screen; re-entry starts a fresh scope.

Checks: rapid navigation, failure during teardown, repeated entry/exit, and host reload while work is active. Observe real lifecycle outcomes rather than internal method calls.

## M05: Native background audio

Status: planned. Depends on M04 and a separate platform audio contract.

Scope: native playback ownership, platform audio session, background capability, interruption handling, and visible application state.

Acceptance: playback and reported state remain coherent across background/foreground transitions and interruption recovery on a physical device. Release resources on stop and session teardown.

Checks: platform configuration, background playback, interruption and route changes, foreground reconciliation, and reload behavior. Do not assume JavaScript continues running in the background.

## T01: Inspect the native runtime through Planetary Escape

Status: active. The owner requested telemetry after the physical counter proof.
No updated phone build will be installed while the owner is away with it.

Scope: safe Effect spans, native host events, an opt-in authenticated
development relay, and bounded desktop OTLP export. The shared ingestion token
stays in desktop secret management, not in the app.

Acceptance: retrieve a real native-probe trace and log from the actual Tempo
and Loki backends. Verify parentage, safe fields, malformed input rejection,
bounded queues and shutdown, and exporter-outage isolation. No raw model or
exception payload may leave the runtime.

Checks: Effect tracer/recording-client tests, Mac host/probe export, read-only
backend queries, native build and simulator checks. Physical-device telemetry
requires a later install and is not inferred from desktop success.

See [the observability contract](blueprint/03-observability.md) and the
implementation log for delivery evidence.

## Deferred work

Android implementation follows evidence from these slices. Framework extraction, engine portability, EAS build/distribution, and richer native bindings require concrete needs and separate acceptance criteria. None is claimed as implemented.
