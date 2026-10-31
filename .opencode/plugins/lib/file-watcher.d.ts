export type WatchChangeType = "added" | "modified" | "deleted"

export interface FileWatcherOptions {
  /** Absolute or relative directory to watch. */
  root: string
  /** Called with an absolute path and the change type, debounced per path. */
  onChange: (absolutePath: string, type: WatchChangeType) => void
  /** Extra directory names to skip, on top of the built-in list. */
  ignoredDirs?: string[]
  /** Quiet period before a change is reported. Default 120 ms. */
  debounceMs?: number
  /** Hard cap on watched directories. Default 400. */
  maxWatchedDirs?: number
  /** Hard cap on directory depth. Default 8. */
  maxDepth?: number
}

export interface FileWatcherHandle {
  /** Stop watching and clear pending timers. Idempotent. */
  close(): void
  readonly watchedDirs: number
  readonly knownFiles: number
  /** True when part of the tree was skipped because of `maxDepth`. */
  readonly depthLimited: boolean
  /** True when part of the tree was skipped because of `maxWatchedDirs`. */
  readonly capped: boolean
}

export declare const DEFAULT_IGNORED_DIRS: string[]

export declare function startFileWatcher(options: FileWatcherOptions): FileWatcherHandle

export default startFileWatcher
