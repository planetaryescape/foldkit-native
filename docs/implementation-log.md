# Implementation log

Append evidence here without treating planned milestones as shipped behavior.
The [plan](implementation-plan.md) owns future work; the
[blueprint](blueprint/README.md) owns intended contracts.

## 2026-11-15: Establish the independent experiment

Related: M01 and M02.

The owner approved a public `planetaryescape/foldkit-native` repository, atomic
commits, and parallel implementation work. The initial blueprint separates
accepted product requirements from proposed runtime and platform choices.

The repository exists on GitHub. A Bun workspace is being prepared with
`foldkit@0.170.0` and `effect@4.1.4`. Registry metadata declares the Foldkit
release compatible with Effect `~4.1.0`; installation alone does not establish
embedded-engine compatibility.

The first proof will use public Foldkit command/update APIs with our own
experimental counter host. It does not reuse the complete upstream runtime.
No copied private runtime internals are required for that narrower hypothesis.

### Verification

| Check                                            | Result                 |
| ------------------------------------------------ | ---------------------- |
| Public repository creation                       | Passed                 |
| Dependency metadata and initial Bun installation | Passed                 |
| Native engine probe                              | Not run at this record |
| iOS build and physical-device behavior           | Not run at this record |
| Reusable live-development host                   | Not implemented        |

Delivery at this record: local scaffolding and documentation; no published
package, release, or deployed application.

## 2026-11-15: Public Foldkit command and update reuse

Related: M01 and [the dependency audit](research/foldkit-reuse.md).

The counter now imports the published `foldkit/command` and `foldkit/update`
entry points. Native-shaped messages are schema-decoded, updates remain pure,
and a named upstream Command produces a completion after an Effect sleep.
The experimental bridge tracks command fibers and rejects stale-session
results; it is not Foldkit's upstream application runner.

### Verification

| Check                                 | Result                 | Evidence or limitation                                                                      |
| ------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------- |
| `bun precommit`                       | Passed                 | Strict TypeScript, Oxlint, formatting, six Effect-aware tests, relative documentation links |
| `bun run build:counter`               | Passed                 | Produces the standalone IIFE at ignored `dist/counter.js`                                   |
| First macOS JavaScriptCore evaluation | Failed                 | Bundle initialization requires `TextEncoder`, absent from bare JavaScriptCore               |
| iPhone behavior                       | Not run at this record | Apple host implementation remains in progress                                               |

The engine failure is a host-platform compatibility gap, not proof that the
public Foldkit APIs depend on DOM rendering. UTF-8 support must be implemented
and exercised in the real engine before a native compatibility claim.

Delivery at this record: blueprint foundation committed as `70b0b74`; counter
and workspace changes prepared locally. No release or device installation.

## 2026-11-15: Exercise the compiled bridge lifecycle

Related: M01. The tests now evaluate the actual bundled IIFE in isolated
JavaScript contexts through the same host callbacks and timer bindings used by
the native adapter. Controlled host timers exercise stale callbacks without
wall-clock sleeps.

Five additional tests cover malformed serialized input, disposal, same-global
restart, bundle replacement, and two concurrently pending commands. These are
bridge-contract checks, not Apple-engine or physical-device evidence.

The test command builds the bundle first, so a clean checkout cannot
accidentally test a missing or stale artifact.

Delivery at this record: the public command/update experiment is committed as
`ab0ec8c` and pushed to `main`; bridge checks are prepared locally.
