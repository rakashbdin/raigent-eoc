/**
 * File watcher for the EOC plugin.
 *
 * OpenCode v2 does not emit `filesystem.changed` (nor `file.watcher.updated`),
 * so external edits never reach the changed-files store. This module watches
 * the worktree itself with `fs.watch`, one non-recursive watcher per directory,
 * and reports `added` / `modified` / `deleted` through a callback.
 *
 * Deliberately plain JavaScript: it must be runnable by `node --test` without a
 * TypeScript toolchain. Types live in `file-watcher.d.ts`.
 *
 * Guarantees:
 *  - never throws from an event handler; a bad callback cannot kill the watch
 *  - never keeps the process alive (`persistent: false`)
 *  - breadth-first walk, so a directory cap is spent on coverage rather than on
 *    one deep subtree; the cap, the depth cap and an ignore list keep inotify
 *    pressure bounded
 *  - `close()` is idempotent and clears pending debounce timers
 */

import * as fs from "node:fs"
import * as path from "node:path"

/** Directory names never descended into. */
export const DEFAULT_IGNORED_DIRS = [
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "__pycache__",
  ".venv",
  "venv",
  "dist",
  "build",
  "out",
  "target",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  ".gradle",
  ".idea",
  "vendor",
  "coverage",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".tox",
  ".dart_tool",
  ".stack-work",
]

/** Editor and OS litter that must not register as a project change. */
const IGNORED_FILE_RE = /(^\.#|~$|\.sw[px]$|\.tmp$|^4913$|^\.DS_Store$|^\.goutputstream-)/

const DEFAULT_DEBOUNCE_MS = 120
const DEFAULT_MAX_WATCHED_DIRS = 400
const DEFAULT_MAX_DEPTH = 8

/**
 * Start watching `options.root`.
 *
 * @param {{
 *   root: string,
 *   onChange: (absolutePath: string, type: "added" | "modified" | "deleted") => void,
 *   ignoredDirs?: string[],
 *   debounceMs?: number,
 *   maxWatchedDirs?: number,
 *   maxDepth?: number,
 * }} options
 * @returns {{
 *   close: () => void,
 *   watchedDirs: number,
 *   knownFiles: number,
 *   depthLimited: boolean,
 *   capped: boolean,
 * }}
 */
export function startFileWatcher(options) {
  if (!options || typeof options !== "object") throw new TypeError("startFileWatcher: options is required")
  if (typeof options.onChange !== "function") throw new TypeError("startFileWatcher: onChange must be a function")

  const root = path.resolve(options.root || process.cwd())
  const onChange = options.onChange
  const debounceMs = Number.isFinite(options.debounceMs) ? options.debounceMs : DEFAULT_DEBOUNCE_MS
  const maxWatchedDirs = Number.isFinite(options.maxWatchedDirs) ? options.maxWatchedDirs : DEFAULT_MAX_WATCHED_DIRS
  const maxDepth = Number.isFinite(options.maxDepth) ? options.maxDepth : DEFAULT_MAX_DEPTH

  let rootStat = null
  try {
    rootStat = fs.statSync(root)
  } catch {
    rootStat = null
  }
  if (!rootStat || !rootStat.isDirectory()) {
    throw new Error(`startFileWatcher: root is not a directory: ${root}`)
  }

  /** @type {Map<string, fs.FSWatcher>} */
  const watched = new Map()
  /** @type {Set<string>} files known to exist when first seen */
  const known = new Set()
  /** @type {Map<string, ReturnType<typeof setTimeout>>} */
  const timers = new Map()

  const ignoredDirs = new Set(
    [...DEFAULT_IGNORED_DIRS, ...(options.ignoredDirs || [])].map((d) => String(d).toLowerCase())
  )

  let closed = false
  let depthLimited = false
  let capped = false

  const isIgnored = (abs) => {
    const rel = path.relative(root, abs)
    if (!rel) return false
    if (rel.startsWith("..") || path.isAbsolute(rel)) return true
    for (const segment of rel.split(path.sep)) {
      if (segment && ignoredDirs.has(segment.toLowerCase())) return true
    }
    return IGNORED_FILE_RE.test(path.basename(abs))
  }

  const emit = (abs, type) => {
    if (closed) return
    try {
      onChange(abs, type)
    } catch {
      // A subscriber must never break the watcher or the host process.
    }
  }

  const closeDir = (dir) => {
    const watcher = watched.get(dir)
    if (!watcher) return
    try {
      watcher.close()
    } catch {
      // Already closed.
    }
    watched.delete(dir)
  }

  const closeSubtree = (dir) => {
    closeDir(dir)
    const prefix = dir + path.sep
    for (const key of [...watched.keys()]) {
      if (key.startsWith(prefix)) closeDir(key)
    }
  }

  /**
   * Watch `start` and its descendants breadth-first, so the directory cap buys
   * wide coverage (root, then every child, then grandchildren) instead of
   * exhausting itself inside the first large subtree.
   */
  const watchTree = (start, startDepth, emitExisting = false) => {
    /** @type {Array<{ dir: string, depth: number }>} */
    const queue = [{ dir: start, depth: startDepth }]

    for (let head = 0; head < queue.length; head++) {
      if (closed) return
      const { dir, depth } = queue[head]

      if (watched.has(dir)) continue
      if (watched.size >= maxWatchedDirs) {
        capped = true
        continue
      }
      if (depth > maxDepth) {
        depthLimited = true
        continue
      }

      let entries = []
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        continue
      }

      let watcher
      try {
        watcher = fs.watch(dir, { persistent: false }, (eventType, filename) => {
          if (!filename) return
          handleEvent(dir, String(filename))
        })
      } catch {
        continue
      }

      watcher.on("error", () => closeDir(dir))
      watched.set(dir, watcher)

      for (const entry of entries) {
        const child = path.join(dir, entry.name)
        if (entry.isSymbolicLink()) continue
        if (entry.isDirectory()) {
          if (ignoredDirs.has(entry.name.toLowerCase())) continue
          queue.push({ dir: child, depth: depth + 1 })
        } else if (entry.isFile() && !IGNORED_FILE_RE.test(entry.name)) {
          if (!known.has(child)) {
            known.add(child)
            if (emitExisting) emit(child, "added")
          }
        }
      }
    }
  }

  const settle = (abs) => {
    if (closed) return

    let stat = null
    let isLink = false
    try {
      const lst = fs.lstatSync(abs)
      isLink = lst.isSymbolicLink()
      stat = isLink ? null : fs.statSync(abs)
    } catch {
      stat = null
    }

    if (isLink) {
      // Symlinks are not tracked (avoids following them / duplicate watchers).
      return
    }

    if (!stat) {
      // Prune every known entry that lived under the deleted path.
      const prefix = abs + path.sep
      for (const k of [...known]) {
        if (k === abs || k.startsWith(prefix)) known.delete(k)
      }
      closeSubtree(abs)
      emit(abs, "deleted")
      return
    }

    if (stat.isDirectory()) {
      // A directory appeared (or was renamed into place): start watching it,
      // and report the files it already contains as added.
      watchTree(abs, 0, true)
      return
    }

    const type = known.has(abs) ? "modified" : "added"
    known.add(abs)
    emit(abs, type)
  }

  const handleEvent = (dir, name) => {
    if (closed) return
    const abs = path.resolve(dir, name)
    if (isIgnored(abs)) return

    const pending = timers.get(abs)
    if (pending) clearTimeout(pending)
    timers.set(
      abs,
      setTimeout(() => {
        timers.delete(abs)
        settle(abs)
      }, debounceMs)
    )
  }

  watchTree(root, 0)

  const close = () => {
    if (closed) return
    closed = true
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
    for (const dir of [...watched.keys()]) closeDir(dir)
  }

  return {
    close,
    get watchedDirs() {
      return watched.size
    },
    get knownFiles() {
      return known.size
    },
    get depthLimited() {
      return depthLimited
    },
    get capped() {
      return capped
    },
  }
}

export default startFileWatcher
