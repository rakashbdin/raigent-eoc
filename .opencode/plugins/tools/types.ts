/**
 * Shared types for the RAiGENT-EOC (EOC) OpenCode v2 plugin tools.
 *
 * These mirror the parts of the `@opencode/plugin` v2 `Info` / `Tool.Result` /
 * `Tool.Context` contract that the EOC tools use. They are declared locally so
 * the plugin has no runtime dependency on the plugin package (type-only
 * information is erased by the loader's TypeScript transpiler).
 */

export interface EocToolResult {
  /** Text content returned to the model. */
  content?: string
  /** Structured metadata attached to the tool call. */
  metadata?: Record<string, unknown>
}

export interface EocToolContext {
  /** Aborted when the owning session stops. */
  readonly signal?: AbortSignal
  /** Report progress for long-running tools. */
  readonly progress?: (update: Record<string, unknown>) => Promise<void>
}

export interface EocTool {
  name: string
  description: string
  /** JSON Schema describing the tool input object. */
  input: Record<string, unknown>
  execute: (input: any, context: EocToolContext) => Promise<EocToolResult>
}
