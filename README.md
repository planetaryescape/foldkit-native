# foldkit-native

An independent experiment in native UI using Effect and upstream Foldkit.
Not affiliated with the Foldkit or Expo projects.

The target is Foldkit-style application architecture, actual native platform
views, and a reusable development host that loads application code without a
native rebuild after every edit. No React Native, DOM rendering, or WebViews.

This is research code, not a supported native Foldkit renderer. The current
counter reuses Foldkit commands and updates; Swift still owns its view
structure. A JavaScript-authored native view vocabulary and live-development
host are not implemented.

## Development

```sh
bun install
bun precommit
bun run build:counter
```

The Apple host requires macOS and Xcode. See the
[Apple host instructions](native/apple/README.md).

## Telemetry

Use `bun run apple:observe` on the Mac with explicitly enabled, securely
configured export. See [Inspect the native host](docs/telemetry.md).
The hosted credential stays on the desktop. Native telemetry requires an
updated build and an explicit transport; it is not active in the earlier
phone build.

## Documentation

- [Documentation map](docs/README.md)
- [Blueprint](docs/blueprint/README.md)
- [Implementation plan](docs/implementation-plan.md)
- [Implementation log](docs/implementation-log.md)
