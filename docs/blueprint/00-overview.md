# 00: Overview

Status: mixed. Product goals and a minimal project-owned native runner are owner-accepted; broader engine, bridge, and extraction details remain proposed. Baseline: initially empty repository inspected on 2026-11-15; implementation is now in progress.

## Identity

foldkit-native is a public, independent, unofficial experiment for developers who want Foldkit's application model with real native UI and Effect-based TypeScript execution. It is not a Foldkit or Expo project and makes no compatibility or endorsement claim.

The question is practical: can a small application reuse Foldkit's public command/update APIs with our native host and runner, remain responsive during asynchronous work, and offer a reusable development loop?

## Owner-accepted goals

1. Use upstream Foldkit as a real dependency, not a copied or renamed implementation. A minimal project-owned native runner may own processing and command-effect execution.
2. Render through true native platform bindings without React, React Native, or DOM rendering.
3. Organize TypeScript runtime and tooling around Effect, including typed failures and scoped asynchronous work.
4. Provide an Expo Go-style reusable host: install the host, load compatible application bundles, reload, and inspect logs and errors.
5. Prove a native counter and asynchronous command on a physical iPhone as the first vertical milestone.
6. Follow with development-host proof, a searchable native list, scoped screen work, then background audio.

The iPhone milestone is required evidence. Choosing iOS as the long-term primary platform remains a proposal. Android is later planned work, not an implemented capability.

## Principles

- Evidence before framework: one working application boundary before reusable API design.
- Native means native: controls, events, accessibility, threading, and lifecycle must follow the platform.
- One application truth: native views project model state and emit events; they do not maintain a competing application model.
- Lifecycle is a contract: reload and screen teardown must release owned work and resources.
- Describe reuse precisely: public command/update reuse is not reuse of upstream lifecycle or message execution. Record unsupported runtime hooks as extraction gaps, not hidden compatibility claims.

## Non-goals

- A production-ready cross-platform framework or immediate native-widget catalog.
- A React Native replacement with compatibility for its ecosystem.
- Running this custom runtime inside Expo Go.
- Copying Foldkit internals, claiming complete upstream runtime compatibility, or mounting browser UI offscreen.
- Android implementation, hot state preservation, or background audio in the first milestone.
- Publishing private signing material, device identifiers, local account paths, or raw diagnostic dumps.

## Unknowns that must remain visible

| Question                                                    | Evidence needed                                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Which Foldkit public APIs work outside a browser?           | Foldkit 0.170.0 with Effect 4.1.4, exported API inspection, and an executable compatibility probe |
| Could upstream lifecycle/message execution be reused later? | A documented public hook or upstream extraction proposal, separate from the bounded native runner |
| Which engine fits the first host?                           | Effect execution, timers, asynchronous callbacks, bundling, and physical-device behavior          |
| What belongs in a reusable library?                         | Repetition across working slices, not speculative package boundaries                              |
| Can EAS build or distribute this host?                      | A separate successful custom-native-project experiment                                            |

A missing upstream runtime hook is an extraction gap, not a blocker to the bounded counter-host proof of concept. Record that the project owns lifecycle and message execution. A proposed upstream change requires a separate decision; it is not existing support.

See [architecture](01-architecture.md), [decisions](02-decision-log.md), and [milestones](../implementation-plan.md).
