# 02: Decision log

Recorded 2026-11-15 from the owner's project requirements. Accepted goals do not imply implemented mechanisms. Keep IDs stable; supersede rather than renumber.

## D001: Use real upstream Foldkit

Status: accepted product constraint.

- **Choice:** depend on Foldkit 0.170.0 with Effect 4.1.4 and reuse public command/update APIs. The owner accepts a minimal project-owned native runner for processing updates and executing command effects.
- **Alternatives:** copying internals violates the reuse constraint. Requiring the upstream browser runner would unnecessarily block the bounded proof of concept. Assuming a pluggable renderer would misrepresent upstream support.
- **Rationale:** demonstrate honest public-package reuse while independently testing native hosting.
- **Consequences:** the initial host does not reuse upstream lifecycle/message execution and must not claim complete Foldkit runtime compatibility. Missing public runtime hooks are recorded extraction gaps for later, not counter-host blockers.
- **Revisit when:** upstream documents a new extension boundary or the owner explicitly changes the experiment's identity.

## D002: Native UI and Effect TypeScript

Status: accepted product constraint.

- **Choice:** true native platform bindings; no React, React Native, or DOM rendering. All project-owned TypeScript runtime and tooling use Effect.
- **Alternatives:** React Native, WebViews, and a browser shim offer established tooling but do not meet the requested runtime experiment. A parallel ad hoc asynchronous runtime duplicates ownership.
- **Rationale:** native behavior with one TypeScript effect and lifecycle model.
- **Consequences:** platform adapters and embedding infrastructure must be built and verified. Native code remains responsible for native resources.
- **Revisit when:** the owner changes the product constraints, not merely because integration is difficult.

## D003: Reusable development host

Status: accepted product goal; protocol and transport proposed.

- **Choice:** provide bundle reload, logs, errors, and a host/bundle version handshake in an installed reusable host.
- **Alternatives:** rebuilding for every TypeScript edit defeats the required loop. Expo Go cannot host a custom native runtime. EAS is a possible build/distribution service, not a runtime substitute.
- **Rationale:** development ergonomics are part of feasibility.
- **Consequences:** host sessions need teardown and compatibility rules; native capability changes still require rebuilding.
- **Revisit when:** a proven supported host offers the same runtime and native capabilities.

## D004: Prove iOS before platform expansion

Status: iOS-first sequencing proposed; physical iPhone milestone accepted; Android later planned.

- **Choice:** use an iPhone counter plus asynchronous command as the first native proof; defer Android implementation.
- **Alternatives:** parallel platforms multiply unproven engine and bridge work. Simulator-only proof misses the required physical-device boundary.
- **Rationale:** one narrow device slice can reveal feasibility failures early.
- **Consequences:** no Android support claim; iOS primacy remains provisional.
- **Revisit when:** engine/upstream evidence favors a different starting platform, or the first device milestone provides enough evidence to expand.

## D005: Select the engine through evidence

Status: JavaScriptCore implemented as the first candidate; final engine choice unresolved.

- **Choice:** evaluate the smallest viable embedded engine against reused Foldkit public APIs, Effect, our runner, bundling, timers, callbacks, and native scheduling.
- **Alternatives:** a JavaScriptCore-first or Hermes-first choice without a probe risks discovering missing runtime assumptions after building the bridge.
- **Rationale:** engine availability is not compatibility evidence.
- **Consequences:** record pinned versions and missing host globals before committing to an engine API.
- **Revisit when:** a physical-device probe establishes compatibility or a required capability rules a candidate out.

Candidate evidence: the macOS JavaScriptCore probe runs the counter and its
async command after explicit timer and UTF-8 host support. This establishes a
narrow compatibility result, not complete Effect platform support. iOS and
physical-device results remain separately recorded in the implementation log.

## D006: Extract only after working slices

Status: proposed architecture policy.

- **Choice:** begin with the counter and host; extract reusable framework packages only after concrete duplication or a second consumer demonstrates the boundary.
- **Alternatives:** an upfront renderer abstraction or platform-neutral framework adds speculative contracts around an unverified seam.
- **Rationale:** keep feasibility work small and reversible.
- **Consequences:** initial paths and APIs remain provisional; a native list is a useful second test.
- **Revisit when:** two working slices require the same well-understood runtime responsibility.

## D007: Public, independent experiment

Status: accepted project identity.

- **Choice:** describe the project as unofficial and independent; publish only sanitized implementation evidence.
- **Alternatives:** implying affiliation or publishing raw local diagnostics creates misleading claims and privacy risk.
- **Rationale:** make scope, ownership, and evidence trustworthy.
- **Consequences:** no personal device IDs, signing material, private notes, or corporate data in docs or examples.
- **Revisit when:** an explicit upstream relationship changes attribution; privacy requirements continue to apply.
