# AGENTS.md — RAiGENT-EOC

Operating instructions for any AI agent working in this repository.

## What this is

RAiGENT-EOC (short: **EOC**) is an OpenCode-native agent harness: agents,
slash commands, skills, a rule pack, one OpenCode plugin, eight custom tools,
and the `eoc` CLI. It encodes the loop:

> plan → test → implement → review → verify → remember → improve

- Harness: **OpenCode v2 only**. No Claude Code / Codex / Cursor adapters.
- License: MIT. See `LICENSE` and `NOTICE`.

## Layout

- `.opencode/` — the OpenCode surface (agents, commands, skills, rules,
  plugins, instructions). See `.opencode/README.md`.
- `scripts/` — the `eoc` CLI.
- `opencode.json` — `instructions` + `skills` wiring for project scope.
- `AGENTS.md` — this file.
- `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`,
  `TOOLS-STACK.md` — product docs.

## Rules

1. **OpenCode-native only.** No Claude `tools:` lists, no `model: sonnet/opus`,
   no `CLAUDE_*` env vars, no `.claude/` paths, no `ecc:` prefixes.
2. Agents use `mode: primary|subagent` + `permission:` and **inherit** the
   primary model. Do not pin a model.
3. Keep the plugin on the OpenCode **v2** API (`{ id, setup }`).
4. The permission hook stays **observation-only**. Silently widening permissions
   is a security regression.
5. Keep `LICENSE` and `NOTICE` intact.
6. Preserve upstream provenance: `metadata.origin: ECC`, `affaan-m/ECC` URLs,
   and the term "ECC" where it means the upstream project.
7. Verify before merging to `main`.

## Verify

```bash
opencode debug agents
opencode run --standalone --print-logs --log-level info "reply with exactly: OK"
# expect   msg="loading plugin" .../.opencode/plugins/eco.ts
# and NO   "failed to load plugin"
```

The plugin's own `[EOC] ...` hook lines go to `~/.opencode/log/eoc-plugin.log`
(rotated at 1 MB). OpenCode v2 does not forward plugin console output to
`--print-logs` or the server log, so that file is the only hook trace.

## Workflow

`feat/*` → `dev` → verify in OpenCode → `main`. Tag stable points `eoc-vX.Y`.

## Docs to keep current

`README.md` (install/use), `CHANGELOG.md`, `TOOLS-STACK.md` (runtime + API
surface), `.opencode/README.md` (surface layout).
