# foldkit-native: Technical Blueprint

> Explore Foldkit application logic on native platform views, with an Effect-based TypeScript runtime and a reusable development host.

## Document index

| #   | Document                           | What it covers                                                             |
| --- | ---------------------------------- | -------------------------------------------------------------------------- |
| 00  | [Overview](00-overview.md)         | Identity, accepted goals, non-goals, and open questions                    |
| 01  | [Architecture](01-architecture.md) | Runtime boundaries, native ownership, development loop, and evidence gates |
| 02  | [Decision log](02-decision-log.md) | Stable decisions, alternatives, rationale, and revisit conditions          |

## For coding agents

- Preserve upstream Foldkit as a real dependency through its public APIs. A minimal project-owned native runner may process updates and execute command effects. Do not copy internals, claim complete upstream runtime compatibility, or present its existing renderer as pluggable.
- No React, React Native, DOM rendering, WebView UI, or DOM emulation to make a browser runtime appear native.
- TypeScript application runtime and tooling use Effect. Native platform code still owns native resources and platform rules.
- A reusable development host is mandatory, not a later convenience. Expo Go is a workflow reference, not a compatible host.
- Prove the smallest physical-device slice before proposing a framework extraction or Android parity.
- Keep accepted goals, proposed mechanisms, inspected implementation, and runtime verification separate.

## Stack target

| Responsibility                      | Direction                                                                  | Status                                         |
| ----------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------- |
| Application model and update        | Public API reuse from Foldkit 0.170.0 with project-owned native processing | Accepted direction, implementation in progress |
| TypeScript runtime and tooling      | Effect 4.1.4, Bun package and script workflow                              | Accepted direction, implementation in progress |
| UI                                  | True native platform bindings                                              | Owner-accepted goal                            |
| First implementation platform       | iOS                                                                        | Proposed sequencing                            |
| JavaScript engine and native bridge | Select through compatibility evidence                                      | Unresolved                                     |
| Development loop                    | Reusable host, bundle reload, logs, errors, version handshake              | Owner-accepted goal                            |
| Build and distribution              | Evaluate EAS independently of Expo Go                                      | Optional, unverified                           |
| Android                             | Later platform work                                                        | Planned, not implemented                       |

## Authority and delivery

Owner requirements govern product goals. The architecture labels unconfirmed mechanisms as proposals. Inspected code and executed checks establish implementation and verification separately.

[The plan](../implementation-plan.md) orders delivery. Implementation history belongs outside this blueprint. Do not mark a milestone complete because a package scaffold or simulator screen exists.
