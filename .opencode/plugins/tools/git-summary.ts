/**
 * Git Summary Tool
 *
 * Returns branch/status/log/diff details for the active repository.
 */

import { execFileSync } from "child_process"
import type { EocTool } from "./types.ts"

// Conservative subset of git's allowed ref-name characters. Rejects shell
// metacharacters and option-like leading `-` so a model-supplied baseBranch
// cannot inject into the command line.
const SAFE_GIT_REF = /^[A-Za-z0-9._/-]+$/

function isSafeRef(ref: string): boolean {
  if (typeof ref !== "string" || ref.length === 0 || ref.length > 200) return false
  if (!SAFE_GIT_REF.test(ref)) return false
  if (ref.startsWith("-") || ref.startsWith(".") || ref.startsWith("/")) return false
  if (ref.includes("..") || ref.includes("//")) return false
  return true
}

function isSafeDepth(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 1000
}

function runArgs(args: string[], cwd: string): string {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }).trim()
  } catch {
    return ""
  }
}

export default function createGitSummaryTool(directory: string): EocTool {
  return {
    name: "git-summary",
    description: "Generate git summary with branch, status, recent commits, and optional diff stats.",
    input: {
      type: "object",
      properties: {
        depth: { type: "number", description: "Number of recent commits to include (default: 5)" },
        includeDiff: { type: "boolean", description: "Include diff stats against base branch (default: true)" },
        baseBranch: { type: "string", description: "Base branch for diff comparison (default: main)" },
      },
      additionalProperties: false,
    },
    async execute(input) {
      const cwd = directory
      const depth = isSafeDepth(input?.depth) ? input.depth : 5
      const includeDiff = input?.includeDiff ?? true
      const baseBranch = (input?.baseBranch as string) ?? "main"

      const result: Record<string, string> = {
        branch: runArgs(["branch", "--show-current"], cwd) || "unknown",
        status: runArgs(["status", "--short"], cwd) || "clean",
        log: runArgs(["log", "--oneline", `-${depth}`], cwd) || "no commits found",
      }

      if (includeDiff) {
        result.stagedDiff = runArgs(["diff", "--cached", "--stat"], cwd) || ""
        result.branchDiff = isSafeRef(baseBranch)
          ? runArgs(["diff", `${baseBranch}...HEAD`, "--stat"], cwd) || `unable to diff against ${baseBranch}`
          : `unable to diff against ${baseBranch} (invalid ref)`
      }

      return { content: JSON.stringify(result, null, 2) }
    },
  }
}
