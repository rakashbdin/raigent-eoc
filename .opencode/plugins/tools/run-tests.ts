/**
 * Run Tests Tool
 *
 * Detects the package manager and test framework, then returns the exact
 * command to run the suite. It never executes the command itself.
 */

import * as fs from "fs"
import * as path from "path"
import type { EocTool } from "./types.ts"

export default function createRunTestsTool(directory: string): EocTool {
  return {
    name: "run-tests",
    description:
      "Run the test suite with optional coverage, watch mode, or specific test patterns. Automatically detects package manager (npm, pnpm, yarn, bun) and test framework.",
    input: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Test file pattern or specific test name to run" },
        coverage: { type: "boolean", description: "Run with coverage reporting (default: false)" },
        watch: { type: "boolean", description: "Run in watch mode for continuous testing (default: false)" },
        updateSnapshots: { type: "boolean", description: "Update Jest/Vitest snapshots (default: false)" },
      },
      additionalProperties: false,
    },
    async execute(input) {
      const { pattern, coverage, watch, updateSnapshots } = input ?? {}
      const cwd = directory

      const packageManager = detectPackageManager(cwd)
      const testFramework = detectTestFramework(cwd)

      const cmd: string[] = [packageManager]
      if (packageManager === "npm") {
        cmd.push("run", "test")
      } else {
        cmd.push("test")
      }

      const testArgs: string[] = []
      if (coverage) testArgs.push("--coverage")
      if (watch) testArgs.push("--watch")
      if (updateSnapshots) testArgs.push("-u")
      if (pattern) {
        if (testFramework === "jest" || testFramework === "vitest") {
          testArgs.push("--testPathPattern", pattern)
        } else {
          testArgs.push(pattern)
        }
      }

      if (testArgs.length > 0) {
        if (packageManager === "npm") cmd.push("--")
        cmd.push(...testArgs)
      }

      const command = cmd.join(" ")

      return {
        content: JSON.stringify(
          {
            command,
            packageManager,
            testFramework,
            options: {
              pattern: pattern || "all tests",
              coverage: coverage || false,
              watch: watch || false,
              updateSnapshots: updateSnapshots || false,
            },
            instructions: `Run this command to execute tests:\n\n${command}`,
          },
          null,
          2
        ),
      }
    },
  }
}

function detectPackageManager(cwd: string): string {
  const lockFiles: Record<string, string> = {
    "bun.lockb": "bun",
    "bun.lock": "bun",
    "pnpm-lock.yaml": "pnpm",
    "yarn.lock": "yarn",
    "package-lock.json": "npm",
  }

  for (const [lockFile, pm] of Object.entries(lockFiles)) {
    if (fs.existsSync(path.join(cwd, lockFile))) return pm
  }

  return "npm"
}

function detectTestFramework(cwd: string): string {
  const packageJsonPath = path.join(cwd, "package.json")

  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"))
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies }

      if (deps.vitest) return "vitest"
      if (deps.jest) return "jest"
      if (deps.mocha) return "mocha"
      if (deps.ava) return "ava"
      if (deps.tap) return "tap"
    } catch {
      // Ignore parse errors.
    }
  }

  return "unknown"
}
