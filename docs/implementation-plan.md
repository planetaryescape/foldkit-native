# Implementation plan

Status: M01 active, later milestones planned; not completion evidence. Initially drafted 2026-11-15 against an empty repository; implementation is now in progress and does not yet satisfy device acceptance gates.

Follow the [blueprint](blueprint/README.md). Confirmed source paths are `packages/counter`, `native/apple`, and `scripts`. Dependency pins are Foldkit 0.170.0 and Effect 4.1.4. Record actual results and source revisions separately in `docs/implementation-log.md`; do not mark completion from this checklist alone.

## M01: Foldkit counter on a physical iPhone

Status: active. Native proof of concept and public import compatibility are in progress, not complete. Depends on [D001](blueprint/02-decision-log.md#d001-use-real-upstream-foldkit), [D002](blueprint/02-decision-log.md#d002-native-ui-and-effect-typescript), and engine evidence under [D005](blueprint/02-decision-log.md#d005-select-the-engine-through-evidence).

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

## M02: Reusable development host

Status: planned. Depends on M01 and [D003](blueprint/02-decision-log.md#d003-reusable-development-host).

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

## Deferred work

Android implementation follows evidence from these slices. Framework extraction, engine portability, EAS build/distribution, and richer native bindings require concrete needs and separate acceptance criteria. None is claimed as implemented.
