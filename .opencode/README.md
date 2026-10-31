# `.opencode/` — RAiGENT-EOC native layout

OpenCode loads these automatically when it runs from the repository root. There
is no Claude compatibility layer.

| Dir | Holds |
| --- | --- |
| `agents/` | `*.md` subagent defs (`mode: subagent`, `permission:`; model inherited) |
| `commands/` | `*.md` slash commands (`name` + `description` frontmatter) |
| `skills/` | `*/SKILL.md` skills, auto-discovered |
| `rules/` | cross-cutting rule files distilled from the skills |
| `plugins/` | `eco.ts` (OpenCode v2 plugin) + `tools/` (8 custom tools) + `lib/` |
| `instructions/` | always-loaded short briefs referenced by `opencode.json` |

See `../CONTRIBUTING.md` for the conventions used in each directory.
