# foldkit-native

An independent experiment in native UI using Effect and upstream Foldkit.
Not affiliated with the Foldkit or Expo projects.

The target is Foldkit-style application architecture, actual native platform
views, and a reusable development host that loads application code without a
native rebuild after every edit. No React Native, DOM rendering, or WebViews.

This is research code, not a supported native Foldkit renderer. The native
counter and live-development loop have separate verification gates.

## Development

```sh
bun install
bun precommit
bun run build:counter
```

The Apple host requires macOS and Xcode. Platform-specific instructions live in
`native/apple/README.md` when that implementation is available.

## Documentation

- [Documentation map](docs/README.md)
- [Blueprint](docs/blueprint/README.md)
- [Implementation plan](docs/implementation-plan.md)
- [Implementation log](docs/implementation-log.md)
