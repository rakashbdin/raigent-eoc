/**
 * RAiGENT-EOC plugin for OpenCode (`eco.ts`).
 *
 * Native OpenCode **v2** plugin. It replaces the original Claude-Code hook
 * adapter (`ecc-hooks.ts`) and the interim OpenCode v1 rewrite, and preserves
 * the six audited fixes from the port review:
 *  1. session start looks for AGENTS.md/PROJECT.md, not CLAUDE.md.
 *  2. PR-created detection reads the command string, not args.toString().
 *  3. git-push reminder reads the command string, not args.toString().
 *  4. doc-warning + typecheck gates use a snake_case-safe path reader; the
 *     typecheck gate covers edit|write on .js/.jsx/.ts/.tsx.
 *  5. No stale version fallback; a single EOC_VERSION constant.
 *  6. Compaction context carries true counts (71 agents / 103 commands /
 *     311 skills) and EOC naming.
 *
 * Conventions: service tag is "eoc"; env prefix is EOC_ (EOC_HOOK_PROFILE,
 * EOC_DISABLED_HOOKS, EOC_PLUGIN_ROOT...).
 *
 * API mapping from OpenCode v1 -> v2:
 *  - `shell.env`            -> `ctx.shell.hook("create.before")` (mutate env)
 *  - `tool.execute.before`  -> `ctx.tool.hook("execute.before")`
 *  - `tool.execute.after`   -> `ctx.tool.hook("execute.after")`
 *  - `file.edited`          -> handled in `execute.after` for edit/write, plus
 *                              `filesystem.changed` events for external edits
 *  - `session.created`      -> `ctx.event.subscribe()` ("session.created")
 *  - `session.idle`         -> `ctx.event.subscribe()` ("session.idle")
 *  - `session.deleted`      -> `ctx.event.subscribe()` ("session.deleted")
 *  - `file.watcher.updated` -> `filesystem.changed` event
 *  - `experimental.session.compacting` -> `ctx.session.hook("compaction")`
 *  - `permission.ask`       -> `ctx.permission.hook("evaluate")` (observed only;
 *                              see the note on that hook below)
 *  - `todo.updated`         -> no equivalent event in v2; hook removed.
 *
 * The default export is a plain `{ id, setup }` definition. It deliberately
 * does not import `@opencode/plugin` at runtime: the loader only needs the
 * definition object, and avoiding a runtime dependency keeps the plugin
 * working without a `npm install` in `.opencode/`.
 */

import * as fs from "fs"
import * as path from "path"
import { execFile } from "node:child_process"
import createRunTestsTool from "./tools/run-tests.ts"
import createCheckCoverageTool from "./tools/check-coverage.ts"
import createSecurityAuditTool from "./tools/security-audit.ts"
import createFormatCodeTool from "./tools/format-code.ts"
import createLintCheckTool from "./tools/lint-check.ts"
import createGitSummaryTool from "./tools/git-summary.ts"
import createChangedFilesTool from "./tools/changed-files.ts"
import createDependencyAnalyzerTool from "./tools/dependency-analyzer.ts"
import { clearChanges, initStore, recordChange } from "./lib/changed-files-store.ts"
import type { EocTool } from "./tools/types.ts"

const EOC_VERSION = "0.1.0"
const EOC_AGENT_COUNT = 71
const EOC_COMMAND_COUNT = 103
const EOC_SKILL_COUNT = 311

type HookProfile = "minimal" | "standard" | "strict"

/** Minimal view of the OpenCode v2 plugin context used by this plugin. */
interface EocPluginContext {
  readonly location: { readonly directory: string }
  readonly options?: Record<string, unknown>
  readonly shell: {
    hook(
      name: "create.before",
      callback: (event: { command: string; cwd: string; timeout: number; shell: string; env: Record<string, string | undefined> }) => void | Promise<void>
    ): Promise<unknown>
  }
  readonly tool: {
    transform(callback: (editor: { add(tool: unknown): void }) => void): Promise<unknown>
    hook(name: "execute.before" | "execute.after", callback: (event: any) => void | Promise<void>): Promise<unknown>
  }
  readonly session: {
    hook(name: "compaction", callback: (event: { system?: Array<{ type: "text"; text: string }> }) => void | Promise<void>): Promise<unknown>
  }
  readonly permission: {
    hook(name: "evaluate", callback: (event: { action: string; resources: ReadonlyArray<string>; effect: string }) => void | Promise<void>): Promise<unknown>
  }
  readonly event: {
    subscribe(options?: { signal?: AbortSignal }): AsyncIterable<{ type: string; data?: any }>
  }
}

interface ToolArgs {
  filePath?: string
  file_path?: string
  path?: string
  command?: string
  [key: string]: unknown
}

const JS_RE = /\.(ts|tsx|js|jsx)$/

export default {
  id: "eoc",
  async setup(ctx: EocPluginContext): Promise<() => void> {
    const worktreePath = ctx.location?.directory || process.cwd()
    const shellCommand = process.platform === "win32" ? "npx.cmd" : "npx"

    const editedFiles = new Set<string>()
    const pendingToolChanges = new Map<string, { path: string; type: "added" | "modified" }>()
    let writeCounter = 0

    // ---- logging -----------------------------------------------------------
    // OpenCode v2's plugin context no longer exposes `client.app.log()`, so
    // messages go to the server's stdout/stderr, visible with `--print-logs`.
    const log = (level: "debug" | "info" | "warn" | "error", message: string) => {
      const line = `[EOC] ${message}`
      if (level === "error") console.error(line)
      else if (level === "warn") console.warn(line)
      else console.log(line)
    }

    // ---- helpers -----------------------------------------------------------
    const resolvePath = (p: string): string => (path.isAbsolute(p) ? p : path.join(worktreePath, p))

    const hasProjectFile = (relativePath: string): boolean => {
      try {
        return fs.statSync(resolvePath(relativePath)).isFile()
      } catch {
        return false
      }
    }

    /** FIX #4: snake_case-safe file-path reader (filePath / file_path / path). */
    const getFilePath = (args: ToolArgs | undefined): string | null => {
      if (!args) return null
      const p = (args.filePath ?? args.file_path ?? args.path) as string | undefined
      return typeof p === "string" && p.trim() ? p : null
    }

    /** FIX #2/#3: the command lives in args.command, never args.toString(). */
    const getShellCommand = (args: ToolArgs | undefined): string => {
      if (!args) return ""
      const c = args.command
      return typeof c === "string" ? c : ""
    }

    const isShellTool = (tool: string): boolean => tool === "bash" || tool === "shell"

    const run = (cmd: string, args: string[], cwd = worktreePath): Promise<{ ok: boolean; stdout: string; stderr: string }> =>
      new Promise((resolve) => {
        execFile(cmd, args, { cwd, timeout: 120_000, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
          resolve({ ok: !error, stdout: stdout?.toString() ?? "", stderr: stderr?.toString() ?? "" })
        })
      })

    const countConsoleLogs = (filePath: string): number => {
      try {
        const content = fs.readFileSync(resolvePath(filePath), "utf-8")
        let count = 0
        for (const line of content.split("\n")) if (/console\.log/.test(line)) count++
        return count
      } catch {
        return 0
      }
    }

    const changedFilesStore = { initStore, recordChange, clearChanges }
    try {
      initStore(worktreePath)
    } catch {
      log("warn", "changed-files tracking disabled: could not initialise the store.")
    }

    const normalizeProfile = (value: string | undefined): HookProfile =>
      value === "minimal" || value === "strict" ? value : "standard"

    const currentProfile = normalizeProfile(process.env.EOC_HOOK_PROFILE)
    const disabledHooks = new Set((process.env.EOC_DISABLED_HOOKS || "").split(",").map((s) => s.trim()).filter(Boolean))
    const order: Record<HookProfile, number> = { minimal: 0, standard: 1, strict: 2 }
    const hookEnabled = (hookId: string, required: HookProfile | HookProfile[] = "standard"): boolean => {
      if (disabledHooks.has(hookId)) return false
      const need = Array.isArray(required) ? required : [required]
      return need.some((r) => order[currentProfile] >= order[r])
    }

    const safeRegister = async (label: string, register: () => Promise<unknown>): Promise<void> => {
      try {
        await register()
      } catch (error: unknown) {
        log("warn", `could not register ${label}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    // ---- event handlers ----------------------------------------------------
    const onAgentFileEdit = async (filePath: string): Promise<void> => {
      if (!JS_RE.test(filePath)) return
      editedFiles.add(filePath)

      if (hookEnabled("post:edit:format", ["standard", "strict"])) {
        const result = await run(shellCommand, ["prettier", "--write", filePath])
        if (result.ok) log("info", `Formatted: ${filePath}`)
        else log("debug", `Prettier skipped for ${filePath}`)
      }

      if (hookEnabled("post:edit:console-warn", ["standard", "strict"])) {
        const count = countConsoleLogs(filePath)
        if (count > 0) log("warn", `console.log found in ${filePath} (${count} occurrence${count > 1 ? "s" : ""})`)
      }
    }

    const onSessionIdle = async (): Promise<void> => {
      if (!hookEnabled("stop:check-console-log", ["minimal", "standard", "strict"])) return
      if (editedFiles.size === 0) return
      log("info", "Session idle - running console.log audit")

      let total = 0
      const hitFiles: string[] = []
      for (const file of editedFiles) {
        if (!JS_RE.test(file)) continue
        const count = countConsoleLogs(file)
        if (count > 0) {
          total += count
          hitFiles.push(file)
        }
      }

      if (total > 0) {
        log("warn", `Audit: ${total} console.log statement(s) in ${hitFiles.length} file(s)`)
        hitFiles.forEach((f) => log("warn", `  - ${f}`))
        log("warn", "Remove console.log statements before committing")
      } else {
        log("info", "Audit passed: no console.log statements found")
      }

      await notifyDesktop()

      editedFiles.clear()
    }

    const notifyDesktop = async (): Promise<void> => {
      try {
        if (process.platform === "darwin") {
          await run("osascript", ["-e", 'display notification "Task completed!" with title "OpenCode EOC"'])
        } else if (process.platform === "win32") {
          await run("powershell", [
            "-Command",
            "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('Task completed!', 'OpenCode EOC', 'OK', 'Information')",
          ])
        } else if (process.platform === "linux") {
          await run("notify-send", ["OpenCode EOC", "Task completed!"])
        }
      } catch (error: unknown) {
        log("debug", `Desktop notification failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    // ---- tool registration -------------------------------------------------
    await safeRegister("tools", () =>
      ctx.tool.transform((editor) => {
        const tools: EocTool[] = [
          createRunTestsTool(worktreePath),
          createCheckCoverageTool(worktreePath),
          createSecurityAuditTool(worktreePath),
          createFormatCodeTool(worktreePath),
          createLintCheckTool(worktreePath),
          createGitSummaryTool(worktreePath),
          createChangedFilesTool(worktreePath),
          createDependencyAnalyzerTool(worktreePath),
        ]
        for (const tool of tools) editor.add(tool)
      })
    )

    // ---- shell environment (v1 `shell.env`) --------------------------------
    await safeRegister("shell.env", () =>
      ctx.shell.hook("create.before", (event) => {
        const env: Record<string, string> = {
          EOC_VERSION,
          EOC_PLUGIN: "true",
          EOC_HOOK_PROFILE: currentProfile,
          EOC_DISABLED_HOOKS: process.env.EOC_DISABLED_HOOKS || "",
          PROJECT_ROOT: worktreePath,
        }

        const lockfiles: Record<string, string> = {
          "bun.lockb": "bun",
          "bun.lock": "bun",
          "pnpm-lock.yaml": "pnpm",
          "yarn.lock": "yarn",
          "package-lock.json": "npm",
        }
        for (const [lockfile, pm] of Object.entries(lockfiles)) {
          if (hasProjectFile(lockfile)) {
            env.PACKAGE_MANAGER = pm
            break
          }
        }

        const langDetectors: Record<string, string> = {
          "tsconfig.json": "typescript",
          "go.mod": "go",
          "pyproject.toml": "python",
          "Cargo.toml": "rust",
          "Package.swift": "swift",
        }
        const detected: string[] = []
        for (const [file, lang] of Object.entries(langDetectors)) {
          if (hasProjectFile(file)) detected.push(lang)
        }
        if (detected.length > 0) {
          env.DETECTED_LANGUAGES = detected.join(",")
          env.PRIMARY_LANGUAGE = detected[0]
        }

        const rootAlreadySet = Boolean(
          (process.env.EOC_PLUGIN_ROOT || "").trim() || (event.env?.EOC_PLUGIN_ROOT || "").trim()
        )
        if (!rootAlreadySet) env.EOC_PLUGIN_ROOT = worktreePath

        Object.assign(event.env, env)
      })
    )

    // ---- tool hooks (v1 `tool.execute.before`) -----------------------------
    await safeRegister("tool.execute.before", () =>
      ctx.tool.hook("execute.before", (event) => {
        const args = (event?.input ?? {}) as ToolArgs

        if (event?.tool === "write") {
          const filePath = getFilePath(args)
          if (filePath) {
            let type: "added" | "modified" = "modified"
            try {
              type = fs.existsSync(resolvePath(filePath)) ? "modified" : "added"
            } catch {
              type = "modified"
            }
            pendingToolChanges.set(event?.id ?? `write-${++writeCounter}-${filePath}`, { path: filePath, type })
          }

          if (hookEnabled("pre:write:doc-file-warning", ["standard", "strict"]) && filePath) {
            if (
              /\.(md|txt)$/i.test(filePath) &&
              !/(README|CHANGELOG|LICENSE|CONTRIBUTING|AGENTS|PROJECT|TODO|TOOLS-STACK)/.test(filePath)
            ) {
              log("warn", `Creating ${filePath} - consider if this documentation is necessary`)
            }
          }
        }

        const cmd = getShellCommand(args)
        if (isShellTool(event?.tool) && cmd) {
          if (hookEnabled("pre:bash:git-push-reminder", "strict") && cmd.includes("git push")) {
            log("info", "Remember to review changes before pushing: git diff origin/main...HEAD")
          }

          if (hookEnabled("pre:bash:tmux-reminder", "strict")) {
            if (
              /^(npm|pnpm|yarn|bun)\s+(install|build|test|run)/.test(cmd) ||
              /^cargo\s+(build|test|run)/.test(cmd) ||
              /^go\s+(build|test|run)/.test(cmd)
            ) {
              log("info", "Long-running command detected - consider using background execution")
            }
          }
        }
      })
    )

    // ---- tool hooks (v1 `tool.execute.after` + `file.edited`) --------------
    await safeRegister("tool.execute.after", () =>
      ctx.tool.hook("execute.after", async (event) => {
        const args = (event?.input ?? {}) as ToolArgs
        const filePath = getFilePath(args)

        if ((event?.tool === "edit" || event?.tool === "write") && filePath) {
          const key = event?.id ?? `write-${++writeCounter}-${filePath}`
          const pending = pendingToolChanges.get(key)
          if (pending) {
            changedFilesStore.recordChange(pending.path, pending.type)
            pendingToolChanges.delete(key)
          } else {
            changedFilesStore.recordChange(filePath, "modified")
          }

          // Replaces the v1 `file.edited` hook for agent-driven edits.
          await onAgentFileEdit(filePath)
        }

        // FIX #4: snake_case-safe path + JS/TS extensions + write tool.
        if (
          hookEnabled("post:edit:typecheck", ["strict"]) &&
          (event?.tool === "edit" || event?.tool === "write") &&
          filePath &&
          /\.[jt]sx?$/.test(filePath)
        ) {
          const result = await run(shellCommand, ["tsc", "--noEmit"])
          if (result.ok) {
            log("info", "TypeScript check passed")
          } else {
            log("warn", "TypeScript errors detected:")
            for (const line of `${result.stdout}\n${result.stderr}`.split("\n").slice(0, 5)) {
              if (line.trim()) log("warn", `  ${line}`)
            }
          }
        }

        // FIX #2: read the command string, not args.toString().
        if (hookEnabled("post:bash:pr-created", ["standard", "strict"]) && isShellTool(event?.tool) && getShellCommand(args).includes("gh pr create")) {
          log("info", "PR created - check CI status")
        }
      })
    )

    // ---- compaction context (v1 `experimental.session.compacting`) ---------
    await safeRegister("session.compaction", () =>
      ctx.session.hook("compaction", (event) => {
        if (!Array.isArray(event?.system)) return
        const lines = [
          "# EOC Context (preserve across compaction)",
          "",
          `## Active Plugin: RAiGENT-EOC v${EOC_VERSION}`,
          "- Hooks: shell.env, tool.execute.before/after, session.created/idle/deleted, filesystem.changed, compaction, permission.evaluate",
          "- Tools: run-tests, check-coverage, security-audit, format-code, lint-check, git-summary, changed-files, dependency-analyzer",
          `- Agents: ${EOC_AGENT_COUNT} specialized subagents (.opencode/agents/)`,
          `- Commands: ${EOC_COMMAND_COUNT} slash commands (.opencode/commands/)`,
          `- Skills: ${EOC_SKILL_COUNT} workflow skills (.opencode/skills/)`,
          "",
          "## Key Principles",
          "- TDD: write tests first, 80%+ coverage",
          "- Immutability: never mutate, always return new copies",
          "- Security: validate inputs, no hardcoded secrets",
          "",
        ]
        if (editedFiles.size > 0) {
          lines.push("## Recently Edited Files")
          for (const f of editedFiles) lines.push(`- ${f}`)
          lines.push("")
        }
        const guidance =
          "Focus on preserving: 1) Current task status and progress, 2) Key decisions made, 3) Files created/modified, 4) Remaining work items, 5) Any security concerns flagged. Discard: verbose tool outputs, intermediate exploration, redundant file listings."
        event.system.push({ type: "text", text: lines.join("\n") })
        event.system.push({ type: "text", text: guidance })
      })
    )

    // ---- permission observation (v1 `permission.ask`) ----------------------
    // NOTE: v1 auto-approved read-only tools and formatter/test commands. The
    // v2 `evaluate` hook can force allow/deny, but silently widening permission
    // is a security regression, so EOC observes only and lets OpenCode's own
    // permission rules decide.
    await safeRegister("permission.evaluate", () =>
      ctx.permission.hook("evaluate", (event) => {
        log("debug", `Permission ${event?.effect}: ${event?.action} ${(event?.resources ?? []).join(", ")}`)
      })
    )

    // ---- event stream (sessions + filesystem) ------------------------------
    const controller = new AbortController()
    const subscription = (async () => {
      try {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          switch (event?.type) {
            case "session.created": {
              // FIX #1: OpenCode-native context files, not CLAUDE.md.
              if (!hookEnabled("session:start", ["minimal", "standard", "strict"])) break
              log("info", `Session started - profile=${currentProfile}`)
              if (hasProjectFile("AGENTS.md")) log("info", "Found AGENTS.md - loading project context")
              if (hasProjectFile("PROJECT.md")) log("info", "Found PROJECT.md - loading project brief")
              break
            }
            case "session.idle":
              await onSessionIdle()
              break
            case "session.deleted": {
              if (!hookEnabled("session:end-marker", ["minimal", "standard", "strict"])) break
              log("info", "Session ended - cleaning up")
              editedFiles.clear()
              changedFilesStore.clearChanges()
              pendingToolChanges.clear()
              break
            }
            case "filesystem.changed": {
              const data = event?.data ?? {}
              const file = typeof data.file === "string" ? data.file : ""
              if (!file) break
              const changeType = data.event === "add" ? "added" : data.event === "unlink" ? "deleted" : "modified"
              changedFilesStore.recordChange(file, changeType)
              if (data.event === "change" && JS_RE.test(file)) editedFiles.add(file)
              break
            }
            default:
              break
          }
        }
      } catch {
        // Stream ended or was aborted on unload.
      }
    })()

    log("info", `RAiGENT-EOC plugin loaded - profile=${currentProfile}`)

    // Cleanup runs when the plugin unloads.
    return () => {
      controller.abort()
      void subscription
    }
  },
}
