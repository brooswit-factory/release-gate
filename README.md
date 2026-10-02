# release-gate

A reusable GitHub Actions release gate: a pull request that changes gated files must add a
`changelog.d/` fragment whose declared `bump: major|minor|patch` is consistent with the change,
and the version is assigned at release time from those fragments.

Status: a placeholder. The reusable workflow and scripts are being extracted from
[butchr](https://github.com/brooswit-factory/butchr)'s `scripts/release/` and will be tagged `v1`.
