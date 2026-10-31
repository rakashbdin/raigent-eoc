/**
 * Tests for the EOC file watcher (`.opencode/plugins/lib/file-watcher.js`).
 *
 * Run with: npm test    (node --test tests/)
 *
 * These exercise real filesystem events, so each test uses its own temp
 * directory and waits for the debounced callback rather than sleeping blindly.
 */

import test from "node:test"
import assert from "node:assert/strict"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

import { startFileWatcher, DEFAULT_IGNORED_DIRS } from "../.opencode/plugins/lib/file-watcher.js"

const DEBOUNCE = 40
const WAIT_MS = 3000

function makeTree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eoc-watch-"))
  fs.mkdirSync(path.join(root, "src"))
  fs.writeFileSync(path.join(root, "src", "existing.ts"), "export const a = 1\n")
  return root
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true })
}

/** Wait until `predicate()` is true, or fail with the collected events. */
async function waitFor(predicate, events, label) {
  const deadline = Date.now() + WAIT_MS
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((r) => setTimeout(r, 20))
  }
  assert.fail(`timed out waiting for ${label}; events=${JSON.stringify(events)}`)
}

function collect() {
  const events = []
  return {
    events,
    onChange: (abs, type) => events.push({ rel: path.basename(abs), abs, type }),
    find: (rel, type) => events.find((e) => (e.rel === rel || e.abs === rel) && (!type || e.type === type)),
  }
}

test("reports an existing file as modified, not added", async () => {
  const root = makeTree()
  const sink = collect()
  const watcher = startFileWatcher({ root, onChange: sink.onChange, debounceMs: DEBOUNCE })
  try {
    fs.writeFileSync(path.join(root, "src", "existing.ts"), "export const a = 2\n")
    await waitFor(() => sink.find("existing.ts", "modified"), sink.events, "modified")
    assert.equal(sink.find("existing.ts", "added"), undefined, "must not report a pre-existing file as added")
  } finally {
    watcher.close()
    cleanup(root)
  }
})

test("reports a new file as added", async () => {
  const root = makeTree()
  const sink = collect()
  const watcher = startFileWatcher({ root, onChange: sink.onChange, debounceMs: DEBOUNCE })
  try {
    fs.writeFileSync(path.join(root, "src", "brand-new.ts"), "x\n")
    await waitFor(() => sink.find("brand-new.ts", "added"), sink.events, "added")
  } finally {
    watcher.close()
    cleanup(root)
  }
})

test("reports a removed file as deleted", async () => {
  const root = makeTree()
  const sink = collect()
  const watcher = startFileWatcher({ root, onChange: sink.onChange, debounceMs: DEBOUNCE })
  try {
    fs.unlinkSync(path.join(root, "src", "existing.ts"))
    await waitFor(() => sink.find("existing.ts", "deleted"), sink.events, "deleted")
  } finally {
    watcher.close()
    cleanup(root)
  }
})

test("debounces rapid writes into one event", async () => {
  const root = makeTree()
  const sink = collect()
  const watcher = startFileWatcher({ root, onChange: sink.onChange, debounceMs: 150 })
  try {
    const target = path.join(root, "src", "burst.ts")
    for (let i = 0; i < 8; i++) fs.writeFileSync(target, `x = ${i}\n`)
    await new Promise((r) => setTimeout(r, 700))
    const hits = sink.events.filter((e) => e.rel === "burst.ts")
    assert.equal(hits.length, 1, `expected 1 debounced event, got ${JSON.stringify(hits)}`)
  } finally {
    watcher.close()
    cleanup(root)
  }
})

test("watches directories created after start", async () => {
  const root = makeTree()
  const sink = collect()
  const watcher = startFileWatcher({ root, onChange: sink.onChange, debounceMs: DEBOUNCE })
  try {
    const nested = path.join(root, "src", "deep", "deeper")
    fs.mkdirSync(nested, { recursive: true })
    await new Promise((r) => setTimeout(r, 300))
    fs.writeFileSync(path.join(nested, "late.ts"), "x\n")
    await waitFor(() => sink.find("late.ts", "added"), sink.events, "late.ts added in new dir")
  } finally {
    watcher.close()
    cleanup(root)
  }
})

test("ignores build output, VCS metadata and editor litter", async () => {
  const root = makeTree()
  const sink = collect()
  const watcher = startFileWatcher({ root, onChange: sink.onChange, debounceMs: DEBOUNCE })
  try {
    fs.mkdirSync(path.join(root, "node_modules", "pkg"), { recursive: true })
    fs.mkdirSync(path.join(root, ".git"), { recursive: true })
    fs.writeFileSync(path.join(root, "node_modules", "pkg", "index.js"), "x\n")
    fs.writeFileSync(path.join(root, ".git", "HEAD"), "ref\n")
    fs.writeFileSync(path.join(root, "src", "notes.swp"), "x\n")
    fs.writeFileSync(path.join(root, "src", "notes~"), "x\n")

    // A real change must still come through, proving the watcher is alive.
    fs.writeFileSync(path.join(root, "src", "real.ts"), "x\n")
    await waitFor(() => sink.find("real.ts", "added"), sink.events, "real.ts added")

    const noisy = sink.events.filter((e) => /index\.js|HEAD|\.swp|~$/.test(e.rel))
    assert.deepEqual(noisy, [], `ignored paths leaked: ${JSON.stringify(noisy)}`)
  } finally {
    watcher.close()
    cleanup(root)
  }
})

test("walks breadth-first so a cap still covers the whole top level", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eoc-watch-bfs-"))
  const sink = collect()
  try {
    // A deep, wide subtree sorts before "zzz"; depth-first would spend the
    // whole budget inside it and never watch "zzz".
    for (let i = 0; i < 20; i++) {
      fs.mkdirSync(path.join(root, "aaa", `sub${i}`, "nested"), { recursive: true })
    }
    fs.mkdirSync(path.join(root, "zzz"))
    const watcher = startFileWatcher({ root, onChange: sink.onChange, debounceMs: DEBOUNCE, maxWatchedDirs: 8 })
    try {
      assert.ok(watcher.capped, "cap should have been reached")
      fs.writeFileSync(path.join(root, "zzz", "visible.ts"), "x\n")
      await waitFor(() => sink.find("visible.ts", "added"), sink.events, "change in zzz despite the cap")
    } finally {
      watcher.close()
    }
  } finally {
    cleanup(root)
  }
})

test("honours the directory cap", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eoc-watch-cap-"))
  try {
    for (let i = 0; i < 40; i++) fs.mkdirSync(path.join(root, `d${i}`, "nested"), { recursive: true })
    const watcher = startFileWatcher({ root, onChange: () => {}, maxWatchedDirs: 12 })
    try {
      assert.ok(watcher.watchedDirs <= 12, `watched ${watcher.watchedDirs} dirs, cap was 12`)
      assert.ok(watcher.watchedDirs >= 1)
    } finally {
      watcher.close()
    }
  } finally {
    cleanup(root)
  }
})

test("a throwing subscriber does not stop later events", async () => {
  const root = makeTree()
  let calls = 0
  const watcher = startFileWatcher({
    root,
    debounceMs: DEBOUNCE,
    onChange: () => {
      calls++
      throw new Error("subscriber blew up")
    },
  })
  try {
    fs.writeFileSync(path.join(root, "src", "one.ts"), "x\n")
    await waitFor(() => calls >= 1, [], "first callback")
    fs.writeFileSync(path.join(root, "src", "two.ts"), "x\n")
    await waitFor(() => calls >= 2, [], "second callback after a throw")
  } finally {
    watcher.close()
    cleanup(root)
  }
})

test("close() is idempotent and stops reporting", async () => {
  const root = makeTree()
  const sink = collect()
  const watcher = startFileWatcher({ root, onChange: sink.onChange, debounceMs: DEBOUNCE })
  watcher.close()
  watcher.close()
  fs.writeFileSync(path.join(root, "src", "after-close.ts"), "x\n")
  await new Promise((r) => setTimeout(r, 400))
  assert.deepEqual(sink.events, [], "no events after close()")
  cleanup(root)
})

test("rejects a bad root and a missing callback", () => {
  assert.throws(() => startFileWatcher({ root: "/definitely/not/here", onChange: () => {} }), /not a directory/)
  assert.throws(() => startFileWatcher({ root: os.tmpdir() }), /onChange must be a function/)
  assert.ok(DEFAULT_IGNORED_DIRS.includes("node_modules"))
})

test("reports files already present in a directory created at runtime", async () => {
  const root = makeTree()
  const sink = collect()
  const watcher = startFileWatcher({ root, onChange: sink.onChange, debounceMs: DEBOUNCE })
  try {
    const dir = path.join(root, "src", "newdir")
    fs.mkdirSync(dir)
    fs.writeFileSync(path.join(dir, "a.ts"), "x\n")
    fs.writeFileSync(path.join(dir, "b.ts"), "x\n")
    await waitFor(() => sink.find("a.ts", "added") && sink.find("b.ts", "added"), sink.events, "bulk files in new dir")
  } finally {
    watcher.close()
    cleanup(root)
  }
})

test("does not follow or report symlinks created at runtime", async () => {
  const root = makeTree()
  const sink = collect()
  const watcher = startFileWatcher({ root, onChange: sink.onChange, debounceMs: DEBOUNCE })
  try {
    const target = path.join(root, "src", "real.ts")
    fs.writeFileSync(target, "x\n")
    await waitFor(() => sink.find("real.ts", "added"), sink.events, "real file added")
    const before = sink.events.length
    fs.symlinkSync(target, path.join(root, "src", "link.ts"))
    await new Promise((r) => setTimeout(r, 600))
    const leaked = sink.events.slice(before).filter((e) => /link\.ts/.test(e.rel))
    assert.deepEqual(leaked, [], `symlink leaked events: ${JSON.stringify(leaked)}`)
  } finally {
    watcher.close()
    cleanup(root)
  }
})

test("prunes known entries when a directory is deleted and recreated", async () => {
  const root = makeTree()
  const sink = collect()
  const watcher = startFileWatcher({ root, onChange: sink.onChange, debounceMs: DEBOUNCE })
  try {
    const dir = path.join(root, "src", "ephemeral")
    fs.mkdirSync(dir)
    fs.writeFileSync(path.join(dir, "x.ts"), "x\n")
    await waitFor(() => sink.find("x.ts", "added"), sink.events, "first added")
    fs.rmSync(dir, { recursive: true, force: true })
    await waitFor(() => sink.find("x.ts", "deleted") || sink.events.some((e) => e.type === "deleted"), sink.events, "deleted")
    fs.mkdirSync(dir)
    fs.writeFileSync(path.join(dir, "x.ts"), "x\n")
    const before = sink.events.length
    await waitFor(() => sink.events.length > before, sink.events, "recreated event")
    const last = sink.events.filter((e) => /x\.ts/.test(e.rel)).pop()
    assert.equal(last.type, "added", `expected added after recreate, got ${last.type}`)
  } finally {
    watcher.close()
    cleanup(root)
  }
})

test("sets depthLimited when maxDepth is exceeded", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eoc-watch-depth-"))
  try {
    fs.mkdirSync(path.join(root, "a", "b", "c", "d", "e", "f", "g", "h", "i", "j"), { recursive: true })
    const watcher = startFileWatcher({ root, onChange: () => {}, maxDepth: 3 })
    try {
      assert.equal(watcher.depthLimited, true)
    } finally {
      watcher.close()
    }
  } finally {
    cleanup(root)
  }
})

test("seeds known files from the initial walk and reports stats", () => {
  const root = makeTree()
  const watcher = startFileWatcher({ root, onChange: () => {} })
  try {
    assert.ok(watcher.watchedDirs >= 2, "root and src should be watched")
    assert.ok(watcher.knownFiles >= 1, "existing.ts should be seeded as known")
    assert.equal(watcher.depthLimited, false)
  } finally {
    watcher.close()
    cleanup(root)
  }
})
