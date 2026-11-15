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

## 2026-11-15: Apple engine compatibility and startup correction

Related: M01 and [the Apple host](../native/apple/README.md).

The shared Swift adapter embeds JavaScriptCore, supplies owned main-run-loop
timers, validates snapshots with `Codable`, and projects state into persistent
UIKit labels and buttons. A narrow UTF-8 host prelude supplies the encoding
operations required by the pinned Effect bundle. Streaming decoding and
non-UTF-8 codecs are explicitly unsupported.

The real macOS probe passed Unicode, malformed-byte rejection, buffer-view
ranges, command execution, serialized boundaries, disposal, and fresh-runtime
checks. The first simulator UI run failed because the app used the legacy
window lifecycle. The crash stack identified UIKit's missing-scene-lifecycle
check. Scene-based window ownership replaced that startup path before retrying.

### Verification

| Check                                        | Result  | Evidence or limitation                                                                   |
| -------------------------------------------- | ------- | ---------------------------------------------------------------------------------------- |
| macOS JavaScriptCore `HostProbe`             | Passed  | Actual bundled Foldkit command/update application with host timers and UTF-8 support     |
| Unsigned iOS device-target compilation       | Passed  | Latest scene-based source compiles with Xcode 27.2                                       |
| Initial simulator UI suite                   | Failed  | Startup rejected for missing scene lifecycle; no successful interaction evidence         |
| Startup/immediate-increment retry            | Passed  | One XCUITest passed after scene adoption                                                 |
| Signed physical-device build                 | Blocked | `errSecInternalComponent` during code signing, including retry after local authorization |
| Physical-device installation and interaction | Not run | Signing must be resolved first                                                           |

Simulator result bundles and crash diagnostics remain local. They contain
machine-specific data and are not public repository artifacts. No Keychain
permissions or signing material were changed.

The native controls still have a fixed Swift-authored structure. M01V records
the remaining TypeScript-native view-expression work. The reusable development
host is not implemented, and M01 is not complete without physical-device
verification.

Delivery at this record: public command/update and bridge-test commits exist;
the Apple host is prepared locally. No release or physical-device handoff.

## 2026-11-15: Separate transient UI timing from command execution

Related: M01. After scene adoption, the two async simulator tests failed to
observe the 500ms pending label. The startup/immediate test remained green.
This was not a simulator crash and did not invalidate the passing real-engine
command probe.

The demo command duration is being increased to three seconds through its
normal Effect path, not a test-only native implementation. Core virtual-clock
tests and controlled bridge-timer expectations must follow that same duration.
The purpose is visible progress for both a person and UI automation.

The async UI tests must be rerun before their behavior is reported as passed.
Physical-device signing remains unresolved.

## 2026-11-15: Verify the native counter candidate

Related: M01. Counter source baseline: `e285963`. The Apple source accompanying
this entry uses scene-based startup and the same three-second command bundle.
The local and Mac bundle SHA-256 values match:
`dc5cc366b4725078f057567433290a2752fa67e9183bb5137820e175ed21ce71`.

### Verification

| Check                                        | Result          | Evidence or limitation                                                                          |
| -------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------- |
| `bun precommit`                              | Passed          | Eleven tests plus strict types, lint, formatting, bundle production, and documentation links    |
| Updated macOS `HostProbe`                    | Passed          | Disposal/restart observation extends 3.5 seconds beyond pending work, past the command deadline |
| Latest unsigned iOS build                    | Passed          | Xcode 27.2, Debug, device target; no signing or installation                                    |
| Complete simulator UI suite                  | Passed          | Three tests, zero failures or skips, from one run of the latest counter bundle                  |
| Physical iPhone build/install                | Blocked         | Signing still returns `errSecInternalComponent`; no device interaction claim                    |
| Expo Go-style live-development loop          | Not implemented | M02 remains planned                                                                             |
| TypeScript-authored native view descriptions | Not implemented | M01V remains planned                                                                            |

The simulator suite exercises immediate updates, visible pending/completion,
and another immediate tap while a command is pending. It does not exercise
scene disconnection/reconnection or prove graceful process-termination cleanup.
The engine probe separately exercises explicit disposal and fresh-runtime
startup.

The first native candidate is ready for an atomic source commit. The latest
build has not been installed on the physical phone, so M01 remains active and
there is no completed mobile handoff. Resolving local Apple signing
authorization is the next device-validation step; native view expression and
the reusable development host remain subsequent implementation work.
