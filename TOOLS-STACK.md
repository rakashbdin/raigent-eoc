# TOOLS-STACK.md — RAiGENT-EOC

## Runtime
- OpenCode (terminal/TUI) — only harness. No Claude Code dependency.
- Node.js 18+ — plugin runtime + scripts.
- Git — `RAiGENT-EOC` versioning.

## OpenCode natives used
- `opencode.json` — `instructions`, `skills` (v2 keys)
- `.opencode/agents/*.md` — `mode: primary|subagent`, `permission:`, inherited model
- `.opencode/commands/*.md` — slash commands (description + name frontmatter)
- Agent Skills (`SKILL.md`, `name`/`description` frontmatter), auto-discovered
  from `.opencode/skills/`
- OpenCode **v2** plugin API (`.opencode/plugins/eco.ts`, plain
  `{ id, setup }` default export):
  - `ctx.tool.transform` — registers the eight EOC tools
  - `ctx.tool.hook("execute.before" | "execute.after")`
  - `ctx.shell.hook("create.before")` — EOC_* env injection
  - `ctx.session.hook("compaction")` — compaction context
  - `ctx.permission.hook("evaluate")` — observed only
  - `ctx.event.subscribe()` — `session.created/idle/deleted`,
    `filesystem.changed`
  - (v1's `todo.updated` has no v2 event; the hook was dropped)
- EOC tools live in `.opencode/plugins/tools/` and are registered by the plugin
  (changed-files, dependency-analyzer, run-tests, check-coverage,
  security-audit, format-code, lint-check, git-summary)
- MCP servers via `opencode.json` (replacing ECC `mcp-configs/` Claude shape)

## Provenance
- Ported from ECC upstream `affaan-m/ECC` v2.2.3 (MIT, © 2026 Affaan Mustafa).
  See `LICENSE` and `NOTICE`. Upstream sync happens in a separate conversion
  workspace, not in this repository.
- npm `ecc-universal` — reference only; EOC does not depend on it.

## Not used
- Claude Code plugin system, `.claude/`, `CLAUDE.md`, `ecc@ecc` slug,
  `install.sh --profile full`, Codex/Cursor/Gemini adapters.
