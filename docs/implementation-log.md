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

## 2026-11-15: Publish the verified source candidate

Native source revision: `cc5f015`. The blueprint, upstream counter integration,
compiled-bridge checks, visible async demo, Apple host, and CI workflow are
committed and pushed to public `main`. The host-local ignore file keeps
generated native artifacts out of Git when the host directory is used
independently.

GitHub CI is running the TypeScript gate and the macOS engine/unsigned-iOS
checks for that revision. Local simulator evidence remains local; no device
identifiers, signing configuration, screenshots, or crash reports are tracked.

Delivery: pushed source, no release, no physical-device installation, and no
completed M01 handoff. M01V and M02 are still unimplemented.

## 2026-11-15: Resolve the signing security-session mismatch

Correction to the earlier physical-device signing blocker: inspecting the
Keychain from the SSH process confirmed it was locked in that security
session. Unlocking or approving access in the desktop did not make that
separate SSH session suitable for signing.

A one-shot job bootstrapped into the current user's GUI launch domain signed
the same binary with the same existing certificate successfully. Running
`xcodebuild build-for-testing` through that domain also passed, and
`devicectl` installed the resulting app on the physical iPhone.

No certificates, provisioning credentials, Keychain passwords, or Keychain
access-control settings were changed. The temporary signing and build jobs
were removed after completion. Local launch-job files and logs remain under
ignored `.local/`, not the user's persistent LaunchAgents directory.

Physical-device UI tests are now running. Installation alone is not interaction
evidence; their actual results must be recorded before claiming the counter
milestone complete.

## 2026-11-15: Physical iPhone counter verification

Related: M01 and D008. Application source baseline: `9a786a8`; app/runtime
code is unchanged from the previously verified native candidate. Versions:
Foldkit 0.170.0, Effect 4.1.4, Xcode 27.2. The latest signed Debug build was
installed and exercised on an iPhone 14 Pro running iOS 26.6.2.

### Verification

| Check                             | Result  | Evidence or limitation                                                              |
| --------------------------------- | ------- | ----------------------------------------------------------------------------------- |
| GUI-session `build-for-testing`   | Passed  | Uses the existing signing identity without credential or Keychain changes           |
| Physical-device installation      | Passed  | Installed `org.planetaryescape.foldkitnative`                                       |
| Complete physical-device UI suite | Passed  | Three tests, zero failures or skips; result platform reports iOS, not iOS Simulator |
| Immediate increment               | Passed  | Native button updates visible count                                                 |
| Delayed increment                 | Passed  | Native pending state and completion observed                                        |
| Immediate tap during pending work | Passed  | Visible count changes while the delayed command remains pending                     |
| Final app launch                  | Passed  | Latest installed app launched after the test run                                    |
| Temporary GUI jobs                | Removed | Test/build jobs are not persistent launch agents                                    |

The device initially needed unlocking before XCTest could start; once ready,
the complete suite ran successfully. Screenshots and xcresult remain local.
The shared-host explicit disposal probe also passes, while graceful UIKit
scene disconnection/reconnection is still not directly covered on the phone.

M01 is complete for the bounded native counter proof. This does not establish
a TypeScript-authored native renderer or the reusable development host. M01V
and M02 remain planned.

Delivery: signed application installed, tested, and launched on the physical
iPhone. A reusable Effect-based GUI-session device runner and this evidence
are being prepared for an atomic commit; no framework package or store
release has been published.

The reusable `apple:device build-for-testing` runner subsequently passed on
the Mac using the same GUI-session approach. A separate cleanup check found no
remaining temporary Foldkit launch jobs and confirmed the generated job file
was removed. The runner's argument, plist-escaping, and completion-watcher
checks bring the TypeScript suite to fifteen passing tests.

## 2026-11-15: Select the hosted telemetry target

Related: T01. The owner authorized Sentry or Planetary Escape and then left
with the phone. Planetary Escape's authenticated OTLP endpoint is selected.
No phone interactions or updated installations are planned while it is away.

A connectivity span was accepted by the public collector and independently
retrieved by trace ID from Tempo. This verifies authentication and retention,
not application instrumentation. The native-probe exporter still needs its
own trace and log retrieval before delivery is claimed.

Hosted ingestion credentials remain in the existing SOPS/age path on the Mac,
scoped to the sender process. No shared infrastructure, credentials, retention,
or authentication policy was changed.

Implementation work separates native safe-record generation from the
Effect-owned desktop exporter. This avoids placing the shared hosted bearer
token in the JavaScript bundle or app.

## 2026-11-15: Retrieve native-probe telemetry from both backends

Related: T01. The instrumented macOS JavaScriptCore probe completed
successfully with explicit export enabled. Native records were decoded and
sent through Effect's protobuf OTLP serialization/exporter.

Backend evidence:

- Tempo returned real `Counter.dispatch` traces for
  `foldkit-native.apple-host`.
- Trace `719144ede8f18160ee13936038089bda` contains a dispatch parent,
  `Counter.command`, `DelayedIncrement`, and `Counter.complete` with the
  expected parent-span relationships and approximately three seconds of
  command work.
- Loki returned native lifecycle events and span-summary logs, including
  cancellation outcomes and standard trace/span correlation.
- A categorized Loki query confirmed service/environment are stream labels;
  trace/span IDs and observed timestamps are structured metadata rather than
  indexed labels.

This is real application-probe delivery evidence, not only a collector HTTP
acknowledgement. Read-only queries used temporary loopback port-forwards
which were stopped afterward. No shared infrastructure was changed.

The initial observer inherited exporter headers into its native child even
though native code did not use or export them. The observer boundary is being
tightened to remove those credentials and disable duplicate relay transport;
the final version must be rechecked before claiming that boundary complete.

The physical phone still runs the earlier verified counter build, without
these telemetry hooks. No updated app was installed or exercised while the
owner was away.

## 2026-11-15: Verify the final telemetry boundary and relay

Related: T01. The observer now strips hosted OTLP headers, secret-manager
variables, and relay configuration from the native child. A synthetic-secret
test covers that boundary. Export still succeeds with the credential retained
only by the desktop exporter.

The final macOS native probe passed strict record validation, nonzero IDs,
UInt64 timestamp limits, safe error projection, queue pressure, exporter
outage isolation, transport release, and explicit disposal. Native and desktop
relay tokens now share the same 32-to-256-byte limits.

### Verification

| Check                                   | Result   | Evidence or limitation                                                                               |
| --------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `bun precommit`                         | Passed   | Forty-three tests plus types, lint, formatting, bundle production, and documentation links           |
| Final macOS native probe                | Passed   | Instrumented JavaScriptCore counter and native telemetry lifecycle                                   |
| Authenticated native HTTP relay         | Passed   | Real URLSession sender through the loopback relay to hosted protobuf OTLP                            |
| Unauthenticated relay request           | Rejected | HTTP 401                                                                                             |
| Record with private extra field         | Rejected | HTTP 400; input not admitted                                                                         |
| Relay shutdown                          | Passed   | SIGTERM exit 143, scoped exporter flush, no lingering relay                                          |
| Tempo retrieval after final relay run   | Passed   | Trace `38b32a1cc4a8453e9eb2464d765a8b57`, approximately 3005ms, four correctly related counter spans |
| Loki retrieval after final relay run    | Passed   | Native lifecycle, invalid-message, and correlated command/span records                               |
| Latest unsigned iOS compilation         | Passed   | New host diagnostics and transport compile for the device target                                     |
| Latest simulator UI suite               | Passed   | Three tests, zero failures or skips                                                                  |
| Updated physical-device telemetry build | Deferred | Owner away with phone; no new install or device interaction                                          |

Invalid application messages are WARN rather than error incidents.
Cancellation is not exported as an ordinary command failure. Model contents,
arbitrary causes/stacks, credentials, paths, and device identifiers are excluded.
Telemetry remains opt-in, and no shared infrastructure was changed.

Delivery at this record: telemetry source and runbook are prepared for atomic
commits. Desktop export and relay delivery are verified. Physical-device and
background telemetry delivery are not claimed.

Instrumentation source is committed as `9dbbc1d`. The following tooling commit
adds the secure observer, authenticated relay, configuration example, and
operator runbook. The phone continues to run the counter build verified before
these telemetry changes; its update remains deferred.
