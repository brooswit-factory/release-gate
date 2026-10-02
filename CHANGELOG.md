# Changelog

## Versioning

This project follows semantic versioning (`major.minor.patch`):

- **major** — a breaking change to the gate's behavior or its inputs (a
  `### BREAKING` section is required).
- **minor** — a backwards-compatible addition (a new input, a new supported
  `version-file` format, a new check that only fires when opted into).
- **patch** — a backwards-compatible fix.

Versions are assigned at merge time by the release workflow, from the
`bump:` level declared in each PR's `changelog.d/` fragment — never by
editing this file or the version file directly on a branch. Dated entries
appear below this section as releases happen.
