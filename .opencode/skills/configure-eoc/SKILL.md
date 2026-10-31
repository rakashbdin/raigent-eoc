---
name: configure-eoc
description: "Install, reconfigure, or repair a RAiGENT-EOC (EOC) setup for OpenCode: choose project vs global scope, set the EOC hook profile (minimal/standard/strict) and hook allowlist, then verify agents, commands, skills, and the plugin actually load. Use when installing EOC, changing hook profiles, moving EOC between scopes, or debugging why EOC agents, skills, or hooks are missing."
metadata:
  origin: ECC
---

# Configure EOC (OpenCode)

RAiGENT-EOC is **OpenCode-native only**. It is distributed as this repository,
not as an npm package, and it has no Claude Code, Codex, or Kimi wizard. If a
user asks to run `npx ...`, `claude plugin ...`, `codex plugin ...`, or an
`ecc@ecc` marketplace command, stop and correct them: those paths do not exist
for EOC.

Inventory first, collect only supported choices, preview, confirm once, apply,
then verify. Never copy plugin components by hand and never clone EOC into a
temporary directory.

## Route by scope

- **Project scope (default).** OpenCode auto-discovers the surface when it runs
  from the repo: `.opencode/agents/`, `.opencode/commands/`,
  `.opencode/skills/`, and `.opencode/plugins/`. Nothing to install.
- **Global scope.** To make EOC available in every project, copy or symlink the
  `.opencode/` surface into OpenCode's global config directory
  (`~/.config/opencode/`). Prefer symlinks so updates stay in one place.

There is no `user | project | local` selector and no marketplace. Do not offer
them.

## Hook profiles

The OpenCode plugin (`eco.ts`) reads two environment variables:

- `EOC_HOOK_PROFILE` — `minimal | standard | strict` (default `standard`).
  - `minimal` keeps session lifecycle logging only.
  - `standard` adds format-on-edit, console.log warnings, doc warnings, and the
    PR-created notice.
  - `strict` adds the git-push and long-running-command reminders and the
    TypeScript gate after edits.
- `EOC_DISABLED_HOOKS` — comma-separated hook IDs to switch off individually,
  e.g. `post:edit:format,pre:write:doc-file-warning`.

Set these in the shell that launches OpenCode (or export them in the user's
profile). Ask exactly one profile question and require one value. Hook
preference is per-user, not per-scope.

## Install or reconfigure

### 1. Inventory without changing anything

```bash
ls .opencode/agents .opencode/commands .opencode/skills .opencode/plugins
cat opencode.json
```

Report the detected scope, whether `opencode.json` lists the EOC instructions,
and the currently exported `EOC_HOOK_PROFILE` (empty means `standard`).

### 2. Preview the planned change

Summarize: scope (project or global), target directory, the profile value, and
whether files will be copied or symlinked. Ask one yes/no question. Do not run a
mutating command before the confirmation.

### 3. Apply

For project scope there is nothing to write beyond placing this repo where
OpenCode runs. For global scope, symlink the surface:

```bash
ln -s "$PWD/.opencode/agents"   ~/.config/opencode/agents
ln -s "$PWD/.opencode/commands" ~/.config/opencode/commands
ln -s "$PWD/.opencode/skills"   ~/.config/opencode/skills
ln -s "$PWD/.opencode/plugins"  ~/.config/opencode/plugins
```

Do not overwrite existing files; if a destination exists, report it and ask
whether to migrate rather than deleting it.

## Verify

Require each check to pass before declaring success:

```bash
opencode debug agents          # lists the EOC subagents alongside built-ins
opencode plugin list           # shows .opencode/plugins/eco.ts
```

Then run one task and confirm the plugin loads. Use `--standalone` so the
server logs are printed:

```bash
opencode run --standalone --print-logs --log-level info "reply with exactly: OK"
# expect: level=INFO msg="loading plugin" id=.../.opencode/plugins/eco.ts
# and NO "failed to load plugin" or "could not register".
```

The eight EOC tools (`run-tests`, `check-coverage`, `security-audit`,
`format-code`, `lint-check`, `git-summary`, `changed-files`,
`dependency-analyzer`) become available to the agent once the plugin loads. If
they are missing, the plugin failed to load — read the `--print-logs` output
for `failed to load plugin` or a `could not register ...` message, which names
the group that failed.

The plugin's own `[EOC] ...` lines (including
`[EOC] RAiGENT-EOC plugin loaded - profile=<value>`) are written to OpenCode's
main log at `~/.local/share/opencode/log/opencode.log`, not to `--print-logs`.

## Repair and uninstall

- **Repair**: `git pull` the repo; confirm `.opencode/package.json` still
  exists (the plugin has no runtime dependencies, so no `npm install` is
  required). Restart OpenCode so the plugin reloads.
- **Change profile**: update `EOC_HOOK_PROFILE` and restart OpenCode.
- **Uninstall**: remove the EOC entries under `.opencode/` (or the global
  symlinks) and delete `opencode.json` if EOC created it. Leave `LICENSE` and
  `NOTICE` in place.
