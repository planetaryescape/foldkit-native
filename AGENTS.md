# foldkit-native

Independent, unofficial native-framework experiment. No React, React Native,
DOM renderer, or WebView substitution.

- Start with [the documentation map](docs/README.md), then the relevant blueprint,
  implementation plan, and recent implementation log.
- Use upstream Foldkit public APIs and exact compatible Effect versions. Do not
  copy internals or describe the browser runtime as renderer-independent.
- TypeScript runtime and tooling use Effect. Swift owns Apple platform bindings.
  Parse runtime boundaries with schemas and keep resources scoped.
- Use Bun. Run `bun precommit` and `bun run build:counter` before committing code.
  Native changes also require the macOS JavaScriptCore probe and an iOS build.
- A slice requiring physical-device behavior is incomplete until checked on the
  physical iPhone. Record blocked, simulator-only, and unverified work honestly.
- Keep the blueprint, future plan, and evidence-backed implementation history
  distinct. Make atomic commits, without co-authors.
- Never commit generated bundles, Xcode projects, signing configuration, device
  identifiers, local diagnostics, or credentials.
