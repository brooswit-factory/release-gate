# release-gate

A reusable GitHub Actions workflow that enforces a per-PR changelog-fragment
discipline: a pull request that changes a gated file must add exactly one
new `changelog.d/<TICKET>.md` fragment declaring a `bump: major|minor|patch`
consistent with the change. The version itself is assigned later, at release
time, from the fragments present on the base branch — never on a branch, and
never by hand.

This repo ships the **gate only**. A reusable *release* workflow (collating
fragments into a version bump and a tagged release — "option B", no bot
commit) is a separate, later piece and is not part of `v1`.

## What it enforces

- A changed file matching `gated-paths` requires at least one new
  `changelog.d/*.md` fragment (one per PR — never append to an existing
  fragment, so two concurrent PRs never conflict on the same lines).
- A fragment's first `bump: major|minor|patch` line must be present and
  valid.
- A fragment must have at least one bullet under a recognized section
  (`BREAKING`, `Added`, `Changed`, `Fixed`, `Removed`).
- A `### BREAKING` section requires `bump: major`, and `bump: major`
  requires a `### BREAKING` section — checked in both directions.
- A changed file under `schema/` requires at least `bump: minor`. This rule
  is hard-coded to the `schema/` directory — it is not affected by
  `gated-paths` or `surface-patterns`.
- If `surface-patterns` is set and a match it finds (within files under
  `gated-paths`) disappears vs. the base branch, that requires `bump: major`;
  a newly appearing match requires at least `bump: minor`.
- The version file (see `version-file` below) must be unchanged on the
  branch, and `CHANGELOG.md` must not gain a new dated `## [x.y.z] -
  YYYY-MM-DD` heading — both are written by the release workflow, at merge
  time, not by a PR author.
- A PR that touches nothing under `gated-paths` is exempt and must *not*
  touch the version file or add a changelog heading either.

## Wiring a repo

Paste `consumer-stub/ci-release-gate.yml`'s job into your `ci.yml`:

```yaml
  release-gate:
    uses: brooswit-factory/release-gate/.github/workflows/gate.yml@v1
    with:
      gated-paths: '["^src/", "^schema/", "^package\\.json$"]'
      version-file: 'package.json'
```

Then copy `consumer-stub/changelog.d-README.md` to `changelog.d/README.md`
in your repo, so contributors see the fragment format in context.

Consumers pin `@v1` (or whatever major tag is current) and get the scripts
from this repo at that ref — **the scripts are not copied into each repo.**
A new major version of the gate's own behavior ships as a new tag (`v2`,
...) with its own `gate.yml`. **`@v1` only resolves once that tag actually
exists** — it is cut by the maintainer after review, not by this PR; wiring
a consumer up against `@v1` before then will fail to resolve.

## Inputs

| input | default | meaning |
|---|---|---|
| `gated-paths` | `["^src/", "^schema/", "^package\\.json$"]` | JSON array of regex strings. A changed file matching any of them requires a fragment. |
| `version-file` | `package.json` | Path to the file the version is read from. Supported formats: `package.json` (`"version"` field), `gradle.properties` (`version=x.y.z`), `pack.toml` (`version = "x.y.z"`), `release.json` (`"tag"` field). |
| `surface-patterns` | `[]` | Optional JSON array of regex strings, matched within files under `gated-paths`. The set of matches is diffed against the base branch to require a minimum bump on added/removed matches. Empty disables the check. |
| `base-branch` | `main` | Branch to diff against. Used **only** when there is no pull-request base — i.e. `github.base_ref` is empty (a push, not a `pull_request` event). On a `pull_request` run, `github.base_ref` always wins and this input is ignored. |

## How versions are assigned

Not by this repo, yet. The gate only validates that a PR's `changelog.d/`
fragment is internally consistent and that nothing pre-empts the version
bump a release workflow will make later. A reusable *release* workflow that
collates fragments on merge to the base branch, computes the next version,
writes it into the version file and a dated `CHANGELOG.md` heading, tags the
release, and deletes the consumed fragments, is tracked separately and will
pin its own tag the same way this gate does.

## Development

```
bun test                      # unit tests
bun run check                 # run the gate against this repo's own branch
```

`.github/workflows/ci.yml` runs both, plus calls `gate.yml` on this repo
itself (with `gated-paths` pointed at `scripts/` and the workflow file
rather than `src/`, since that's where this repo's own gated code lives).
