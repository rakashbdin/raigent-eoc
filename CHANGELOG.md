# Changelog

All notable changes to RAiGENT-EOC are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project aims
to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.1.1 — 2026-10-31

### Fixed

- Session-start hook now fires in every session, including one-shot
  `opencode run`. OpenCode v2 emits no `session.created`, so start is derived
  from `session.inbox.enqueued` / `session.execution.started` (and from the
  first tool or permission event carrying a `sessionID`), deduped per session.
  The session-idle audit follows `session.execution.succeeded`.
- Plugin hook output now goes to `~/.opencode/log/eoc-plugin.log` (rotated at
  1 MB). OpenCode v2 forwards neither plugin console output to `--print-logs`
  nor to its server log, so hooks were previously unobservable.

## 0.1.0 — 2026-10-17

Initial release. Full OpenCode-native port of ECC's agent-harness system.

### Added

- **71 agents** in `.opencode/agents/` — OpenCode `mode: subagent` with explicit
  `permission:` maps; model inherited from the primary agent.
- **103 commands** in `.opencode/commands/` — 35 upstream-native commands kept
  across collisions, 68 converted.
- **311 skills** in `.opencode/skills/` and **122 rule files** in
  `.opencode/rules/`, auto-discovered.
- **OpenCode v2 plugin** `.opencode/plugins/eco.ts` — plain `{ id, setup }`
  export, zero runtime dependencies, registering hooks and events
  (`shell.create.before`, `tool.execute.before/after`, `session.compaction`,
  `permission.evaluate`, and the session/filesystem event stream).
- **8 custom tools** in `.opencode/plugins/tools/`: `run-tests`,
  `check-coverage`, `security-audit`, `format-code`, `lint-check`,
  `git-summary`, `changed-files`, `dependency-analyzer`.
- **`eoc` CLI** — `scripts/` (369 files) with a root `package.json` `eoc`
  binary, plus the SQLite state store, catalog, doctor, and repair workflows.
- **Hook profiles** (`EOC_HOOK_PROFILE` = `minimal` / `standard` / `strict`) and
  a per-hook allowlist (`EOC_DISABLED_HOOKS`).
- **Docs** — `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`,
  `NOTICE`, `TOOLS-STACK.md`.

### Changed

- Rebranded `ecc-*` user-facing skills and commands to `eoc-*`
  (`eoc-guide`, `eoc-recipes`, `eoc-tools-cost-audit`, `configure-eoc`).
- Rewrote `configure-eoc` from the dead multi-harness wizard into an
  OpenCode/EOC install-and-configure skill.
- `opencode.json` canonicalized to auto-discovered `.opencode/skills`.
- Rebranded capitalized `ECC` prose to `EOC` across the OpenCode surface, while
  preserving upstream URLs, package names, and `metadata.origin: ECC`.
- Command frontmatter normalized to the OpenCode v2 fields (`description`,
  `agent`, `model`, `subagent`): dropped the invalid `model: opus` pin and the
  Claude-only `allowed-tools`, `disable-model-invocation`, `command`, and
  `argument-hint` fields; migrated the deprecated `subtask` alias to `subagent`
  (18 commands).
- `astra-review` no longer pins a model — its prose refers to the session's
  primary model, and its plugin-root fallback uses `.config/opencode`.
- Command resolver fallbacks point at `~/.config/opencode`, not `~/.claude`.
- Nested stray top-level `origin:` moved under `metadata:` in 9 skills, matching
  the other 280.
- Split the shippable harness out of the conversion workspace: this repository
  contains only the product (`.opencode/`, `scripts/`, config, and product
  docs). Upstream sync and porting notes live in the separate conversion
  workspace.

### Fixed

All six audited `ecc-hooks.ts` bugs, carried over as design constraints:

1. Session start now looks for `AGENTS.md` / `PROJECT.md`, not `CLAUDE.md`.
2. PR detection reads the shell command string, not `args.toString()`.
3. The git-push reminder reads the shell command string, not `args.toString()`.
4. Path reads are snake_case-safe; the typecheck gate covers `edit|write` on
   `.js/.jsx/.ts/.tsx`.
5. A single `EOC_VERSION` constant replaces the stale version fallback.
6. Compaction context carries true counts and EOC naming.

- Reverted three documentation/model references the rebrand had corrupted:
  `platform.opencode.com` → `platform.claude.com`, `build-with.opencode` →
  `build-with-claude`, and a mangled `us.anthropic.*` model-ID example.
- Cost surfaces now read the log from the EOC data home
  (`~/.opencode/metrics/costs.jsonl`), matching the `stop:cost-tracker` writer,
  instead of `~/.claude` / `~/.config/opencode`.
- `repo-scan` installs into the OpenCode global skills directory
  (`~/.config/opencode/skills`) rather than `~/.claude/skills`.

### Removed

- Claude Code plugin shape, `.claude/` paths, `CLAUDE.md` lookups, and the
  `ecc@ecc` marketplace flow.
- The npm `@opencode/plugin` runtime dependency (the plugin is dependency-free).
