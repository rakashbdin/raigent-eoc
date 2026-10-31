# RAiGENT-EOC

**An OpenCode-native agent harness.** 71 specialized agents, 103 slash
commands, 311 skills, a rule pack, a plugin, and 8 custom tools — all wired for
[OpenCode](https://opencode.ai) and nothing else.

EOC is a rewrite of [ECC](https://github.com/affaan-m/ECC) (MIT, © Affaan
Mustafa) that drops the Claude Code protocol entirely. No `CLAUDE.md`, no
`CLAUDE_*` env vars, no `.claude/` paths, no `ecc:` command prefixes, no
Codex/Cursor adapters. Just the ECC workflow system, rebuilt for OpenCode.

The operating loop it encodes:

> **plan → test → implement → review → verify → remember → improve**

---

## Requirements

| Requirement | Notes |
| --- | --- |
| [OpenCode](https://opencode.ai) v2 | Built and verified against `v2.0.18`. |
| Node.js 18+ | For the plugin runtime and the `eoc` CLI. |
| Git | For versioning and upstream sync. |

No other runtime dependencies. The plugin has **zero npm dependencies** and
`.opencode/` needs no `npm install`.

---

## Quick start (project scope — recommended)

OpenCode auto-discovers everything when it runs from the repository root.

```bash
git clone <your-fork-or-copy> raigent-eoc
cd raigent-eoc

# Optional: only needed for the `eoc` CLI, not for the OpenCode surface.
npm install

opencode
```

That is the whole install for project scope. From inside the folder you get:

```bash
opencode debug agents     # your EOC subagents, alongside the built-ins
/plan                     # any of the 103 commands
@planner  add a caching layer to the search endpoint   # invoke an agent
```

### Verify the plugin loaded

Run one headless task and confirm the plugin loads:

```bash
opencode run --standalone --print-logs --log-level info "reply with exactly: OK"
```

Expect a `loading plugin` line for EOC and **no** load failure:

```text
level=INFO msg="loading plugin" id=.../.opencode/plugins/eco.ts
```

If the plugin fails to load, the same output names the failure
(`failed to load plugin` or `could not register ...`). The eight EOC tools and
all hooks become available once it loads.

> The plugin's own `[EOC] ...` log lines go to OpenCode's main log at
> `~/.local/share/opencode/log/opencode.log`, not to `--print-logs`.

---

## Optional: global scope

To make EOC available in **every** project, put the OpenCode surface in your
global config directory. Symlinks keep updates in one place.

```bash
ln -s "$PWD/.opencode/agents"   ~/.config/opencode/agents
ln -s "$PWD/.opencode/commands" ~/.config/opencode/commands
ln -s "$PWD/.opencode/skills"   ~/.config/opencode/skills
ln -s "$PWD/.opencode/plugins"  ~/.config/opencode/plugins
```

Do not overwrite existing files — if a destination already exists, merge or
rename rather than delete. The `configure-eoc` skill walks through scope choice,
profile selection, preview, and verification.

---

## What's included

| Surface | Count | Location | How OpenCode finds it |
| --- | ---: | --- | --- |
| Agents | 71 | `.opencode/agents/*.md` | auto-discovered (`mode: subagent`) |
| Commands | 103 | `.opencode/commands/*.md` | auto-discovered |
| Skills | 311 | `.opencode/skills/*/SKILL.md` | auto-discovered |
| Rules | 122 | `.opencode/rules/**` | referenced by instructions |
| Custom tools | 8 | `.opencode/plugins/tools/*.ts` | registered by the plugin |
| Plugin | 1 | `.opencode/plugins/eco.ts` | auto-discovered |
| CLI scripts | 369 | `scripts/**` | `eoc` binary (`package.json` → `scripts/eoc.js`) |

### Agents

71 subagents (`mode: subagent`) with explicit `permission:` maps — planner,
code-architect, code-reviewer, security-reviewer, tdd-guide, build resolvers
per language, and language/framework reviewers. They inherit the primary model
rather than pinning one, so a single `--model` choice governs the whole session.

Invoke one with `@name`, or list them with `opencode debug agents`.

### Commands

103 slash commands, including the EOC workflow family:

```text
/plan  /tdd  /code-review  /build-fix  /verify  /learn  /checkpoint
/update-codemaps  /update-docs  /hookify  /santa-loop  /quality-gate  ...
```

### Skills

311 `SKILL.md` skills, auto-discovered. Load one by asking for the task it
covers, or reference it directly (e.g. *"use the `tdd-workflow` skill"*). The
`eoc-guide` skill is the on-demand map of the whole surface.

### Rules

122 rule files under `.opencode/rules/` — cross-cutting principles distilled
from the skills (security, testing, git hygiene, language conventions).

### Custom tools

Registered through the OpenCode v2 plugin API:

| Tool | Purpose |
| --- | --- |
| `run-tests` | Detect and run the project's test suite |
| `check-coverage` | Coverage vs. threshold; flags uncovered files |
| `security-audit` | Dependency, secret, and code audit |
| `format-code` | Detect formatter and format a file |
| `lint-check` | Detect linter; check or fix |
| `git-summary` | Branch, status, commits, and diff stats |
| `changed-files` | Session change tree (added/modified/deleted) |
| `dependency-analyzer` | Outdated, vulnerable, and unused dependencies |

### Plugin

`.opencode/plugins/eco.ts` is a native **OpenCode v2** plugin
(`export default { id: "eoc", setup(ctx) {...} }`). It registers the tools and
wires these hooks and events:

- `ctx.shell.hook("create.before")` — injects `EOC_*` context into every shell
  command (version, profile, project root, detected package manager and
  languages).
- `ctx.tool.hook("execute.before" / "execute.after")` — change tracking,
  doc-file warnings, PR/push reminders, format-on-edit, console.log warnings,
  and the strict TypeScript gate.
- `ctx.session.hook("compaction")` — preserves task state, decisions, edited
  files, and EOC counts across context compaction.
- `ctx.permission.hook("evaluate")` — **observation only**. EOC logs the
  permission decision but never widens it; OpenCode's own rules always decide.
- `ctx.event.subscribe()` — `session.created` / `session.idle` /
  `session.deleted` and `filesystem.changed`.

---

## The `eoc` CLI

`scripts/` ships the EOC command-line tool (root `package.json` maps the `eoc`
binary to `scripts/eoc.js`). It powers setup, discovery, diagnostics, and the
state store.

```bash
npm install                      # installs the CLI's dependencies
node scripts/eoc.js --help       # full command list

node scripts/eoc.js setup        # guided install/update of the OpenCode harness
node scripts/eoc.js catalog      # discover install profiles and component IDs
node scripts/eoc.js doctor       # diagnose missing or drifted managed files
node scripts/eoc.js status       # SQLite state-store summary
node scripts/eoc.js repair       # restore drifted or missing managed files
node scripts/eoc.js memory       # shared cross-agent memory
```

Global install: `npm link` puts `eoc` on your `PATH`.

> The CLI is inherited from upstream and carries some internal `ecc-*`
> identifiers in its script tree. These are implementation detail; the
> user-facing command is `eoc`.

---

## Configuration

EOC configures itself through environment variables read by the plugin. Set
them in the shell that launches OpenCode.

| Variable | Values | Default | Effect |
| --- | --- | --- | --- |
| `EOC_HOOK_PROFILE` | `minimal` \| `standard` \| `strict` | `standard` | How much automation the plugin runs. |
| `EOC_DISABLED_HOOKS` | comma-separated hook IDs | *(none)* | Switch individual hooks off. |
| `EOC_PLUGIN_ROOT` | path | project root | Root the plugin resolves paths against. |

### Hook profiles

| Profile | Adds |
| --- | --- |
| `minimal` | Session lifecycle logging only. |
| `standard` | Format-on-edit, console.log warnings, doc-file warnings, PR-created notice. |
| `strict` | Git-push and long-running-command reminders, and the TypeScript gate after edits. |

### Disabling individual hooks

```bash
export EOC_DISABLED_HOOKS="post:edit:format,pre:write:doc-file-warning"
```

Available hook IDs: `session:start`, `session:end-marker`,
`stop:check-console-log`, `post:edit:format`, `post:edit:console-warn`,
`post:edit:typecheck`, `pre:write:doc-file-warning`, `pre:bash:pr-created`,
`pre:bash:git-push-reminder`, `pre:bash:tmux-reminder`.

### Shell environment injected into every command

`EOC_VERSION`, `EOC_PLUGIN`, `EOC_HOOK_PROFILE`, `EOC_DISABLED_HOOKS`,
`EOC_PLUGIN_ROOT`, `PROJECT_ROOT`, and — when detected — `PACKAGE_MANAGER`,
`DETECTED_LANGUAGES`, `PRIMARY_LANGUAGE`.

---

## Updating and repairing

- **Update:** `git pull`, then restart OpenCode so the plugin reloads.
- **Repair:** `node scripts/eoc.js repair` (CLI-managed files) or check the
  `[EOC]` log lines for a failed group.
- **Uninstall:** remove the EOC entries under `.opencode/` (or the global
  symlinks) and delete `opencode.json` if EOC created it.

See [`configure-eoc`](.opencode/skills/configure-eoc/SKILL.md) for the guided
flow.

---

## Attribution and license

RAiGENT-EOC is derived from **[ECC](https://github.com/affaan-m/ECC)** by Affaan
Mustafa, used under the MIT License. The original copyright and license are
preserved in [`LICENSE`](LICENSE); see [`NOTICE`](NOTICE) for attribution.

- Ported skills retain `metadata.origin: ECC` and upstream URLs as provenance.
  References to "ECC" in skill and agent bodies generally mean the upstream
  project and are intentional.
- Upstream sync (cherry-picking new ECC releases) happens in a separate
  conversion workspace, not in this repository.

Everything EOC adds — the OpenCode-native surface, the v2 plugin, the tools,
and the CLI integration — is released under the same MIT terms.

---

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md): branch from `dev`, keep the port
rules (OpenCode frontmatter, no Claude protocol, upstream provenance), and
verify with `opencode run --standalone --print-logs` before merging.

## Security

See [`SECURITY.md`](SECURITY.md) for the security model and how to report an
issue. EOC's permission hook is observation-only by design.
