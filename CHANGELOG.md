# Changelog

## 0.1.1

- Mark the pi peer dependency optional (`peerDependenciesMeta`), so `npm install` no longer pulls the
  peer and its whole dependency tree into the package clone (165 packages → 0).

## 0.1.0

- Initial release. Appends a configurable trailer (default `Assisted-by: <you>`) to `git commit`
  calls issued by the pi agent's bash tool.
- Configuration layers: built-in defaults → `<agent-dir>/git-attribution.json` →
  `<repo>/.pi/git-attribution.json` → `--assisted-by` flag.
- `/attribution` command to inspect and change the trailer, and three ways to opt out
  (`PI_GIT_ATTRIBUTION=0`, `{"enabled": false}`, `.pi/no-attribution`).
- Skips duplicate trailers when a commit reuses an existing message
  (`--amend --no-edit`, `-C <commit>`).
