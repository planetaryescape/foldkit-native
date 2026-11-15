# Inspect the native host

The selected backend is [Planetary Escape Grafana](https://grafana.planetaryescape.co.za/explore).
Native counter spans go to Tempo; safe host events and correlated span
summaries go to Loki. Metrics and system-level native crash uploads are not
enabled.

The probe deliberately exercises rejected inputs and startup-failure fixtures,
so some diagnostic failure events are expected even when its overall result
is `PASS`.

## Observe a real macOS host run

From this repository on a Mac with Xcode:

```sh
bun install --frozen-lockfile
bun run build:counter
```

Export is off by default. Enable it for one process using the existing
SOPS-managed ingestion credential. In Fish:

```fish
begin
    set -lx SOPS_AGE_KEY_FILE "$HOME/.config/sops/age/hetzner-observability.agekey"
    set -l otel_token (sops --decrypt --extract '["data"]["token"]' "$HOME/source/oss/hetzner-observability/secrets/otel-ingest-auth.yaml" | base64 --decode)
    set -lx FOLDKIT_TELEMETRY_ENABLED true
    set -lx OTEL_EXPORTER_OTLP_ENDPOINT https://otel.planetaryescape.co.za
    set -lx OTEL_EXPORTER_OTLP_PROTOCOL http/protobuf
    set -lx OTEL_EXPORTER_OTLP_HEADERS "Authorization=Bearer $otel_token"
    set -lx OTEL_SERVICE_NAME foldkit-native.apple-host
    bun run apple:observe
end
```

This runs the actual Swift/JavaScriptCore probe, decodes its bounded diagnostic
records, and flushes them through Effect's protobuf OTLP exporter. The child
program's success/failure remains independent of telemetry availability.

The shared ingestion credential is desktop-only. Never put it in the native
bundle, JavaScript, command-line arguments, a screenshot, or tracked
configuration. Do not dump the sender's environment.

## Query the results

In Grafana Explore, select Tempo:

```text
{ resource.service.name = "foldkit-native.apple-host" }
```

Look for `Counter.dispatch` with `Counter.command`, `DelayedIncrement`, and
`Counter.complete` children. Disposal can cancel command spans without an
error outcome.

For Loki:

```text
{service_name="foldkit-native.apple-host"}
```

Host events include `host.start`, `host.started`, `host.failure`, and
`host.disposed`. Failures carry finite classifications rather than arbitrary
exception messages. Span-summary logs carry standard trace/span correlation.

Records exclude the model, original input, exception text, stack traces,
paths, device identifiers, and credentials. Exporter outages and overflow
produce bounded local diagnostics instead of changing application behavior.

## Native transport and device limits

For relay-based runs, start `bun run telemetry:relay` in the same securely
configured desktop environment. Set `FOLDKIT_TELEMETRY_SESSION_TOKEN` to a
fresh random value of at least 32 characters, shared only with that
development session. The relay binds `127.0.0.1:4319` by default, accepts
authenticated `POST /events`, and rejects oversized or malformed records.
Its `202` response is best-effort admission, not proof of backend retention.

Do not expose the relay without its session authentication or weaken
transport security to reach it from a device. A phone connection needs an
explicit trusted HTTPS route, not the Mac's loopback URL.

`FOLDKIT_TELEMETRY_STDOUT=1` enables framed records for local probe consumption.
An optional native relay transport uses `FOLDKIT_TELEMETRY_RELAY_URL` and a
separate `FOLDKIT_TELEMETRY_SESSION_TOKEN`. The relay token is not the hosted
ingestion credential. Network transport accepts HTTPS or loopback HTTP and
does not weaken iOS transport security.

Choose one transport for each host run. The stdout observer disables inherited
relay configuration and removes hosted-ingestion credentials from the native
child environment.

Native instrumentation does not remotely modify an already-installed app.
The phone's telemetry build needs a later install and explicit development
connection when the owner returns. Desktop export is not proof of
physical-device or background export.

See the [observability contract](blueprint/03-observability.md) for ownership,
bounds, and privacy, and the [implementation log](implementation-log.md) for
actual backend-retrieval evidence.
