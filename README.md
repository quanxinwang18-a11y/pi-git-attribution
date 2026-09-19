# pi-git-attribution

[![npm version](https://img.shields.io/npm/v/pi-git-attribution)](https://www.npmjs.com/package/pi-git-attribution)

A [pi](https://pi.dev) package that discloses AI-assisted commits: it appends a trailer
(default `Assisted-by: <you>`) to every `git commit` the agent runs through the bash tool.

```
git commit -m "fix: retry on timeout"
  ↓
git commit --trailer "Assisted-by: qxwang6-pi" -m "fix: retry on timeout"
```

Nothing else changes: no git config, no git hooks, no rewrite of your checkout. Remove the
package (or disable it in `pi config`) and the behavior is gone.

## Install

```bash
pi install npm:pi-git-attribution                        # npm (recommended)
pi install git:github.com/quanxinwang18-a11y/pi-git-attribution@v0.1.1   # pinned git tag
pi install /absolute/path/to/pi-git-attribution          # local checkout
```

Then configure a value — without one the extension stays inert on purpose, so a shared
package can never sign commits on someone else's behalf.

## Configure

```
/attribution                          show current state and the global config path
/attribution qxwang6-pi               set the trailer value (global)
/attribution -l repo-bot              set it for this project only
/attribution key Assisted-by          change the trailer token (default: Assisted-by)
/attribution off | on                 enable or disable (add -l for project scope)
```

`pi config` enables and disables installed resources; it does not edit values. Use it to
turn the extension on or off, and `/attribution` (or the files below) for the value.

### Resolution order (later wins)

| Layer | Path | Keys |
|---|---|---|
| defaults | — | `{ "enabled": true, "key": "Assisted-by", "value": "" }` |
| global | `<agent-dir>/git-attribution.json` | all |
| project | `<repo>/.pi/git-attribution.json` (trusted projects only) | all |
| CLI flag | `--assisted-by <value>` | `value` |

```json
{
  "enabled": true,
  "key": "Assisted-by",
  "value": "qxwang6-pi"
}
```

### Disable

| Mechanism | Scope |
|---|---|
| `PI_GIT_ATTRIBUTION=0` | environment |
| `{"enabled": false}` in either config file | global or project |
| `.pi/no-attribution` marker file | repository (no JSON needed) |
| `pi config` → disable the extension | global or project |

## Scope

| Situation | Handled |
|---|---|
| agent runs `git commit`, `cd x && git commit`, `git -C <path> commit` | ✅ |
| `git commit --amend --no-edit` / `-C <commit>` reusing an attributed message | skipped, no duplicate |
| command already contains `--trailer` | left untouched |
| `git commit-tree`, `git log`, other git commands | untouched |
| agent writes a script that commits, then runs it | ❌ not intercepted |
| your own `!` shell escapes inside pi (`user_bash`) | ❌ not intercepted |
| commits you make in a terminal | ❌ not intercepted |

Trailer token choice matters. `Assisted-by` states that the commit was *assisted* by a tool;
`Co-Authored-By` claims shared authorship (and shows up in contributor lists), and
`Signed-off-by` is a human DCO attestation that a tool must never emit. Some upstreams ban AI
attribution trailers outright — keep the opt-out handy when contributing to them.

## Uninstall

```bash
pi remove npm:pi-git-attribution
```
