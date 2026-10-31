'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const CURRENT_PLUGIN_SLUG = 'eoc';
// Legacy install id, kept for existing installs.
const LEGACY_PLUGIN_SLUG = 'everything-claude-code';
const CURRENT_PLUGIN_HANDLE = `${CURRENT_PLUGIN_SLUG}@${CURRENT_PLUGIN_SLUG}`;
const LEGACY_PLUGIN_HANDLE = `${LEGACY_PLUGIN_SLUG}@${LEGACY_PLUGIN_SLUG}`;
const PLUGIN_CACHE_SLUGS = [CURRENT_PLUGIN_SLUG, LEGACY_PLUGIN_SLUG];
const PLUGIN_ROOT_SEGMENTS = [
  [CURRENT_PLUGIN_SLUG],
  [CURRENT_PLUGIN_HANDLE],
  ['marketplaces', CURRENT_PLUGIN_SLUG],
  [LEGACY_PLUGIN_SLUG],
  [LEGACY_PLUGIN_HANDLE],
  ['marketplaces', LEGACY_PLUGIN_SLUG],
];

// Artifacts that identify a COMPLETE EOC root when the caller gives no explicit
// probe. A real EOC root ships both the script tree AND EOC's skills; a partial
// install (scripts copied, skills not) must not qualify for skill-resolving
// callers, which build `skills/...` paths against the resolved root (#2544).
// Checking "skills/ exists" is not enough — a user's own ~/.opencode/skills/ can
// be present with none of EOC's skills — so we probe for a sentinel skill that
// ships in every EOC root and is exactly what the failing skill commands need.
// If that skill is ever renamed, move this sentinel with it.
const DEFAULT_SCRIPT_PROBE = path.join('scripts', 'lib', 'utils.js');
const DEFAULT_SKILL_PROBE = path.join('.opencode', 'skills', 'continuous-learning-v2');

/**
 * Resolve the EOC source root directory.
 *
 * Tries, in order:
 *   1. EOC_PLUGIN_ROOT env var (set by Claude Code for hooks, or by user)
 *   2. Standard install location (~/.opencode/) — when scripts exist there
 *   3. Known plugin roots under ~/.opencode/plugins/ (current + legacy slugs)
 *   4. Plugin cache auto-detection — scans ~/.opencode/plugins/cache/{eoc,everything-claude-code}/
 *   5. Fallback to ~/.opencode/ (original behaviour)
 *
 * @param {object} [options]
 * @param {string} [options.homeDir]  Override home directory (for testing)
 * @param {string} [options.envRoot]  Override EOC_PLUGIN_ROOT (for testing)
 * @param {string} [options.probe]    Relative path used to verify a candidate
 *                                    root contains what the caller needs. When
 *                                    given, it is honored exactly (script
 *                                    consumers pass their own script path). When
 *                                    omitted, a candidate must contain BOTH the
 *                                    EOC script tree and a sentinel EOC skill,
 *                                    so a partial install (scripts without
 *                                    skills) is rejected for skill consumers.
 * @returns {string} Resolved EOC root path
 */
function resolveEccRoot(options = {}) {
  const envRoot = options.envRoot !== undefined
    ? options.envRoot
    : (process.env.EOC_PLUGIN_ROOT || '');

  if (envRoot && envRoot.trim()) {
    return envRoot.trim();
  }

  // EOC: running from a checkout — the repo that ships this module is the root.
  // This is the common case for `node scripts/eoc.js ...` during development.
  const moduleRepoRoot = path.resolve(__dirname, '..', '..');
  const evEnvRoot = options.envRoot !== undefined;

  const homeDir = options.homeDir || os.homedir();
  const configuredDir = options.configDir !== undefined
    ? options.configDir
    : process.env.EOC_CONFIG_DIR;
  const rawDir = typeof configuredDir === 'string' ? configuredDir.trim() : '';
  const expandedDir = rawDir === '~'
    ? homeDir
    : (rawDir.startsWith('~/') || rawDir.startsWith('~\\'))
      ? path.join(homeDir, rawDir.slice(2))
      : rawDir;
  const claudeDir = expandedDir ? path.resolve(expandedDir) : path.join(homeDir, '.config', 'opencode');

  // Decide whether a candidate directory is a usable EOC root. An explicit
  // caller probe is honored exactly (script consumers know the artifact they
  // need). With the default probe the caller is a skill consumer, so a
  // candidate must contain both EOC's scripts and a sentinel EOC skill —
  // otherwise a scripts-only ~/.opencode short-circuits and every skill path
  // resolves to a location that does not exist (#2544).
  const isRoot = options.probe
    ? (dir) => fs.existsSync(path.join(dir, options.probe))
    : (dir) => fs.existsSync(path.join(dir, DEFAULT_SCRIPT_PROBE))
            && fs.existsSync(path.join(dir, DEFAULT_SKILL_PROBE));

  // EOC: when running from a checkout (the normal `node scripts/eoc.js ...`
  // case) the repository shipping this module is the authoritative root. Only
  // consult it when the caller passed no explicit location overrides, so tests
  // that inject homeDir/envRoot/configDir keep their isolated behaviour.
  if (
    !evEnvRoot &&
    options.configDir === undefined &&
    options.homeDir === undefined &&
    isRoot(moduleRepoRoot)
  ) {
    return moduleRepoRoot;
  }

  // Standard install — files are copied directly into ~/.config/opencode/
  if (isRoot(claudeDir)) {
    return claudeDir;
  }

  // Exact legacy plugin install locations. These preserve backwards
  // compatibility without scanning arbitrary plugin trees.
  const legacyPluginRoots = PLUGIN_ROOT_SEGMENTS.map((segments) =>
    path.join(claudeDir, 'plugins', ...segments)
  );

  for (const candidate of legacyPluginRoots) {
    if (isRoot(candidate)) {
      return candidate;
    }
  }

  // Plugin cache — Claude Code stores marketplace plugins under
  // ~/.opencode/plugins/cache/<plugin-name>/<org>/<version>/
  try {
    for (const slug of PLUGIN_CACHE_SLUGS) {
      const cacheBase = path.join(claudeDir, 'plugins', 'cache', slug);
      const orgDirs = fs.readdirSync(cacheBase, { withFileTypes: true });

      for (const orgEntry of orgDirs) {
        if (!orgEntry.isDirectory()) continue;
        const orgPath = path.join(cacheBase, orgEntry.name);

        let versionDirs;
        try {
          versionDirs = fs.readdirSync(orgPath, { withFileTypes: true });
        } catch {
          continue;
        }

        for (const verEntry of versionDirs) {
          if (!verEntry.isDirectory()) continue;
          const candidate = path.join(orgPath, verEntry.name);
          if (isRoot(candidate)) {
            return candidate;
          }
        }
      }
    }
  } catch {
    // Plugin cache doesn't exist or isn't readable — continue to fallback
  }

  return claudeDir;
}

function normalizePluginRootForPlatform(rootDir, platform = process.platform) {
  if (platform !== 'win32' || typeof rootDir !== 'string') return rootDir;

  const match = rootDir.match(/^\/([a-zA-Z])(?:\/(.*))?$/);
  if (!match) return rootDir;

  const [, driveLetter, rest = ''] = match;
  return `${driveLetter.toUpperCase()}:/${rest}`;
}

/**
 * Compact inline locator for embedding in hooks.json and command .md code blocks.
 *
 * Earlier revisions inlined the *entire* resolveEccRoot() search (~700 chars,
 * duplicated ~80×). That blob used a spread (`...s`) over nested array literals,
 * which broke Windows hook execution due to shell quoting (#2368).
 *
 * This minified form contains no spread, no nested array literals, and no
 * escaped double quotes, so it survives `node -e "..."` quoting on every shell.
 * When EOC_PLUGIN_ROOT is set (as Claude Code does for plugin hooks and
 * commands) it is used directly. Otherwise the inline probes the same set of
 * locations resolveEccRoot() knows about — ~/.opencode, the exact plugin roots
 * under ~/.opencode/plugins/, and the versioned plugin cache — only far enough to
 * load the committed resolve-eoc-root module, then delegates the authoritative
 * decision to resolveEccRoot(). This keeps discovery behaviour identical to the
 * old inline while centralising the real logic in one tested module.
 *
 * Usage in commands:
 *   const _r = <paste INLINE_RESOLVE>;
 *   const sm = require(_r + '/scripts/lib/session-manager');
 */
const INLINE_RESOLVE = `(function(){var p=require('path'),f=require('fs'),o=require('os');var e=process.env.EOC_PLUGIN_ROOT;if(e&&e.trim())return e.trim();var d=(process.env.EOC_CONFIG_DIR||'').trim()||p.join(o.homedir(),'.opencode');if(d==='~')d=o.homedir();else if(d.charAt(0)==='~'&&(d.charAt(1)==='/'||d.charCodeAt(1)===92))d=p.join(o.homedir(),d.slice(2));d=p.resolve(d);function L(x){try{return require(p.join(x,'scripts','lib','resolve-eoc-root')).resolveEccRoot()}catch(_){return null}}var r=L(d);if(r)return r;var s=['eoc','ecc@ecc','marketplaces/eoc','everything-claude-code','everything-claude-code@everything-claude-code','marketplaces/everything-claude-code'];for(var i=0;i<s.length;i++){r=L(p.join(d,'plugins',s[i]));if(r)return r}try{var g=['eoc','everything-claude-code'];for(var j=0;j<g.length;j++){var c=p.join(d,'plugins','cache',g[j]);var O=f.readdirSync(c);for(var k=0;k<O.length;k++){var q=p.join(c,O[k]);var V=f.readdirSync(q);for(var m=0;m<V.length;m++){r=L(p.join(q,V[m]));if(r)return r}}}}catch(_){}return d})()`;

module.exports = {
  resolveEccRoot,
  normalizePluginRootForPlatform,
  INLINE_RESOLVE,
};
