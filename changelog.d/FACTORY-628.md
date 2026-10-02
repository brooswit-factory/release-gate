bump: minor

### Added
- the release gate itself: `.github/workflows/gate.yml` (a reusable `workflow_call` workflow), the
  `scripts/release/*` gate logic extracted and generalized from butchr (configurable `gated-paths`,
  `version-file` for package.json/gradle.properties/pack.toml/release.json, and `surface-patterns`),
  a self-test `ci.yml`, and the `consumer-stub/` files a repo pastes in to wire the gate up.
