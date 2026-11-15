import { expect, it } from "@effect/vitest"
import { safeNativeEnvironment } from "./observe-apple"

it("keeps intended desktop credentials and relay settings out of the native stdout child", () => {
  const secret = "synthetic-desktop-only-secret"
  const privateKeys = [
    "OTEL_EXPORTER_OTLP_HEADERS",
    "OTEL_EXPORTER_OTLP_TRACES_HEADERS",
    "OTEL_EXPORTER_OTLP_LOGS_HEADERS",
    "OTEL_EXPORTER_OTLP_METRICS_HEADERS",
    "OTEL_AUTH_TOKEN",
    "OP_SERVICE_ACCOUNT_TOKEN",
    "SOPS_AGE_KEY",
    "SOPS_AGE_KEY_FILE",
    "FOLDKIT_TELEMETRY_RELAY_URL",
    "FOLDKIT_TELEMETRY_SESSION_TOKEN",
  ]
  const environment: Record<string, string | undefined> = {
    ...Object.fromEntries(privateKeys.map((key) => [key, secret])),
    PATH: "/usr/bin:/bin",
    HOME: "/home/test",
    FOLDKIT_TELEMETRY_STDOUT: "0",
  }
  const safe = safeNativeEnvironment(environment)
  expect(safe).toEqual({
    PATH: "/usr/bin:/bin",
    HOME: "/home/test",
    FOLDKIT_TELEMETRY_STDOUT: "1",
  })
  expect(JSON.stringify(safe)).not.toContain(secret)
  expect(environment.OTEL_EXPORTER_OTLP_HEADERS).toBe(secret)
})
