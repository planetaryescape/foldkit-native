# 03: Observability

Status: native hooks and desktop export implemented; Mac probe, authenticated
relay, and Tempo/Loki retrieval verified. Planetary Escape is the selected
target. Device installation is deferred while the owner is away with the phone.

## Questions to answer

- Did the native host start, and where did startup fail?
- Which message caused an update or asynchronous command?
- Did a command succeed, fail, or get cancelled during disposal?
- Did telemetry reach the backend, or was it dropped?

The pure counter model/update module does not depend on telemetry. Its native
composition boundary owns command and message observations.

## Signal and privacy contract

| Signal  | Records                                                      | Allowed information                                                                           |
| ------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Traces  | Counter start, dispatch, command, completion, disposal       | Stable operation names, standard trace/span IDs, timing, finite message/command tags, outcome |
| Logs    | Native host start, ready, failure, disposal, invalid message | Stable event name, timestamp, outcome, finite failure classification                          |
| Metrics | Deferred                                                     | No metric-export or dashboard claim                                                           |

Never export the model, input JSON, arbitrary exception messages, stack traces,
nested causes, filesystem paths, URLs, device identifiers, signing settings,
environment contents, or authentication headers. Schema parsing rejects
additional fields instead of forwarding them.

The tracer uses Effect's native span implementation for identity and parentage.
Its transport projection is allowlisted. A failed span exports a classification,
not automatic exception serialization. Capture a synthetic secret in tests and
prove it is absent from serialized telemetry.

## Native and desktop ownership

```text
Effect counter spans ──┐
                      ├─> validated native telemetry records
Swift lifecycle events┘        |
                               +─> framed stdout from the macOS probe
                               |
                               +─> optional authenticated development relay
                                          |
                               Effect-owned desktop exporter
                                          |
                               authenticated public OTLP/HTTP
                                          |
                               Planetary Escape collector
                                  traces -> Tempo
                                  logs   -> Loki
```

The development relay is not the public collector. It must use a separate,
per-session token and an explicit connection. Its token cannot grant access to
the hosted collector. The default listener is loopback-only. Native HTTP relay
configuration permits HTTPS or loopback HTTP; it does not weaken app transport
security.

The shared hosted-ingestion credential stays in the desktop secret-management
path. It is never bundled into the application or JavaScript, placed in a
command-line argument, or sent to the native host.

## Configuration and resource identity

Target: `https://otel.planetaryescape.co.za`, authenticated OTLP over HTTP.
The exporter owns signal-specific paths below that base endpoint. Prefer the
installed Effect protobuf serialization and exporter APIs.

Resource identity:

- `service.name`: `foldkit-native.apple-host`.
- `service.version`: `0.0.0` until release/version ownership changes.
- `deployment.environment.name`: `local` for these probes.

Export is explicitly enabled for a configured development process. Ordinary
counter operation and CI checks must not require ingestion credentials.
Respect explicit per-signal opt-outs.

Native telemetry transport is also opt-in. Framed stdout is for the macOS
probe. The installed phone build cannot acquire new hooks or configuration
without a later build/install or supported development-host connection.

## Bounded lifecycle and failures

Telemetry is best-effort, not an audit trail. It cannot change the result of a
successful counter operation or recursively report an exporter outage.

- Native queues have a fixed capacity and perform I/O off the UI thread.
- Desktop admission and batching are bounded independently of the SDK's batch
  trigger.
- Outbound requests, retry work, and graceful flush have deadlines.
- Exporter failures use a fixed safe local diagnostic, not a raw SDK cause.
- Runtime disposal stops owned work; shutdown does not promise delivery after
  iOS suspends or terminates the process.

Use Effect scopes and supported exporter flushing at the desktop composition
root. Do not initialize an exporter for every message or command.

## Inspection

Open [Grafana Explore](https://grafana.planetaryescape.co.za/explore).

Tempo TraceQL:

```text
{ resource.service.name = "foldkit-native.apple-host" }
```

Loki LogQL:

```text
{service_name="foldkit-native.apple-host"}
```

A collector HTTP success is not retained-data evidence. Retrieve an actual
native-probe trace and log from Tempo and Loki before claiming delivery.

## Verification boundary

Test safe projection, parent/child relationships, cancellation, malformed input,
queue overflow, exporter failure, and bounded shutdown through real seams.
Use an injected recording HTTP client rather than logger or module spies.

Run the macOS host probe and query its resulting backend records. Simulator
checks can establish build/runtime compatibility while the phone is away.
Physical-device telemetry and background delivery remain unverified until the
updated build is installed and exercised later.

See the [implementation log](../implementation-log.md) for actual results and
the [implementation plan](../implementation-plan.md) for remaining work.
