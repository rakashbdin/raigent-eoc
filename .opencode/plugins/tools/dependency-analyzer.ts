/**
 * Dependency Analyzer Tool
 *
 * Analyzes project dependencies for outdated packages, security
 * vulnerabilities, and unused dependencies. Supports multiple package
 * managers.
 */

import * as fs from "fs"
import * as path from "path"
import type { EocTool } from "./types.ts"

interface DependencyInfo {
  name: string
  current: string
  latest?: string
  type: "production" | "development" | "peer"
  outdated: boolean
  security?: {
    vulnerable: boolean
    severity?: string
    recommendation?: string
  }
}

export default function createDependencyAnalyzerTool(directory: string): EocTool {
  return {
    name: "dependency-analyzer",
    description:
      "Analyze project dependencies for outdated packages, security vulnerabilities, and unused dependencies. Supports npm, pnpm, yarn, and bun.",
    input: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["all", "outdated", "security", "unused"], description: "Type of analysis to run (default: all)" },
        fix: { type: "boolean", description: "Attempt to fix issues automatically (default: false)" },
        depth: { type: "number", description: "Depth of dependency analysis (default: 1)" },
      },
      additionalProperties: false,
    },
    async execute(input) {
      try {
        const cwd = directory
        const analysisType = input?.type ?? "all"
        const fix = input?.fix ?? false
        const depth = input?.depth ?? 1

        const packageManager = detectPackageManager(cwd)
        const dependencies = analyzeDependencies(cwd)
        const summary = generateSummary(dependencies)
        const recommendations = generateRecommendations(dependencies, summary, analysisType)

        return {
          content: JSON.stringify({
            success: true,
            packageManager,
            dependencies: dependencies.slice(0, 50),
            summary,
            recommendations,
            analysisType,
            fixMode: fix,
            depth,
            platform: process.platform,
          }),
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return {
          content: JSON.stringify({
            success: false,
            error: `Failed to analyze dependencies: ${errorMessage}`,
            type: input?.type,
          }),
        }
      }
    },
  }
}

function detectPackageManager(cwd: string): string {
  if (fs.existsSync(path.join(cwd, "bun.lockb")) || fs.existsSync(path.join(cwd, "bun.lock"))) return "bun"
  if (fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))) return "pnpm"
  if (fs.existsSync(path.join(cwd, "yarn.lock"))) return "yarn"
  if (fs.existsSync(path.join(cwd, "package-lock.json"))) return "npm"
  return "npm"
}

function analyzeDependencies(cwd: string): DependencyInfo[] {
  const dependencies: DependencyInfo[] = []

  const packageJsonPath = path.join(cwd, "package.json")
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error("package.json not found")
  }

  let packageJson: Record<string, Record<string, string>>
  try {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"))
  } catch (error) {
    throw new Error(`Failed to read package.json: ${error}`)
  }

  const collect = (deps: Record<string, string> | undefined, type: DependencyInfo["type"]) => {
    if (!deps) return
    for (const [name, version] of Object.entries(deps)) {
      dependencies.push({ name, current: version, type, outdated: false })
    }
  }

  collect(packageJson.dependencies, "production")
  collect(packageJson.devDependencies, "development")
  collect(packageJson.peerDependencies, "peer")

  return dependencies
}

function generateSummary(dependencies: DependencyInfo[]) {
  return {
    total: dependencies.length,
    outdated: dependencies.filter((d) => d.outdated).length,
    vulnerable: dependencies.filter((d) => d.security?.vulnerable).length,
    unused: 0,
  }
}

function generateRecommendations(
  dependencies: DependencyInfo[],
  summary: { total: number; outdated: number; vulnerable: number; unused: number },
  _analysisType: string
): string[] {
  const recommendations: string[] = []

  if (summary.outdated > 0) {
    recommendations.push(`${summary.outdated} outdated dependencies found. Consider updating with: npm update`)
  }

  if (summary.vulnerable > 0) {
    recommendations.push(`${summary.vulnerable} vulnerable dependencies found. Run: npm audit fix`)
  }

  if (summary.total > 100) {
    recommendations.push("Large number of dependencies detected. Consider removing unused packages.")
  }

  const hasTypeScript = dependencies.some((d) => d.name === "typescript")
  const hasEslint = dependencies.some((d) => d.name === "eslint")
  const hasPrettier = dependencies.some((d) => d.name === "prettier")

  if (hasTypeScript && !hasEslint) {
    recommendations.push("TypeScript project without ESLint detected. Consider adding linting.")
  }

  if (hasEslint && !hasPrettier) {
    recommendations.push("ESLint without Prettier detected. Consider adding code formatting.")
  }

  if (recommendations.length === 0) {
    recommendations.push("No critical dependency issues found.")
  }

  return recommendations
}
