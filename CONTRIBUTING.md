# Contributing to RAiGENT-EOC

Thanks for helping. EOC is an OpenCode-native harness, so contributions are
mostly agents, commands, skills, rules, tools, and docs.

## Ground rules

1. **OpenCode-native only.** No Claude Code, Codex, Cursor, or Gemini adapters.
2. **No Claude protocol.** Drop `tools:` lists, pinned `model:` values,
   `CLAUDE_*` env vars, `CLAUDE.md`, `.claude/` paths, and `ecc:` prefixes.
3. **Agents inherit the primary model.** Never pin one.
4. **Keep `LICENSE` and `NOTICE` intact.**
5. **Preserve provenance.** `metadata.origin: ECC`, `affaan-m/ECC` URLs, and
   the term "ECC" where it means the upstream project.

## Branch and commit flow

```
feat/*  →  dev  →  verify in OpenCode  →  main
```

- Branch from `dev` using `feat/<short-name>` (or `fix/<short-name>`).
- Commit with [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `docs:`, `chore:`).
- Verify locally before opening a PR against `dev`.
- `main` is reserved for verified, tagged states (`eoc-vX.Y`).

## Adding or changing a component

### Agents

Every agent uses OpenCode frontmatter:

```yaml
---
description: What the agent does.
mode: subagent
permission:
  edit: allow
  bash: ask
---
```

- Use `mode: primary` only for a genuine primary agent; subagents are the norm.
- Do not add `tools:` lists or `model:` values.

### Skills

Put `SKILL.md` in `.opencode/skills/<id>/`. Paths inside the skill are relative
to the directory containing `SKILL.md`, so keep scripts and references beside it.

Frontmatter needs a `description` for the skill to be advertised to the model.

### Commands

Add `name` and `description` to the frontmatter. Keep the body OpenCode-native.
Use only documented v2 command fields (`description`, `agent`, `model`,
`subagent`).

### Plugin and tools

`.opencode/plugins/eco.ts` targets the **OpenCode v2** plugin API. The eight
tools live in `.opencode/plugins/tools/` and are registered through
`ctx.tool.transform`.

Keep the permission hook **observation-only**. Widening permissions silently is
a security regression.

## Verify before you merge

```bash
# 1. Syntax-check the CLI scripts you touched.
node --check scripts/eoc.js

# 2. Confirm the plugin loads cleanly: expect a `loading plugin` line for
#    eco.ts and NO `failed to load plugin` / `could not register` message.
opencode run --standalone --print-logs --log-level info "reply with exactly: OK"

# 3. Confirm the surface is intact.
opencode debug agents
```

## Docs to keep current

If your change affects install, usage, or counts, update:

- `README.md` — install and usage.
- `CHANGELOG.md` — user-visible changes.
- `TOOLS-STACK.md` — runtime and API surface.
- `.opencode/README.md` — surface layout.

## Reporting and security

- Bugs and feature requests: open an issue with the OpenCode version
  (`opencode --version`), your OS, and the relevant log lines.
- Security issues: follow [`SECURITY.md`](SECURITY.md) — do not open a public
  issue for a vulnerability.
