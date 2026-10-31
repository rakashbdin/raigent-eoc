---
name: skill-host-compat
description: Lint EOC skills for Codex/Cursor-safe frontmatter and Claude-only substitutions before a skill PR.
---
# Skill Host Compatibility

Lint curated `skills/` for Codex-safe frontmatter and Claude-only substitutions.

## Implementation

Run the host-compat validator:

```bash
EOC_ROOT="${EOC_PLUGIN_ROOT:-$(node -e "var r=(function(){var p=require('path'),f=require('fs'),o=require('os');var e=process.env.EOC_PLUGIN_ROOT;if(e&&e.trim())return e.trim();var d=(process.env.EOC_CONFIG_DIR||'').trim()||p.join(o.homedir(),'.config','opencode');if(d==='~')d=o.homedir();else if(d.charAt(0)==='~'&&(d.charAt(1)==='/'||d.charCodeAt(1)===92))d=p.join(o.homedir(),d.slice(2));d=p.resolve(d);function L(x){try{return require(p.join(x,'scripts','lib','resolve-ecc-root')).resolveEccRoot()}catch(_){return null}}var r=L(d);if(r)return r;var s=['ecc','ecc@ecc','marketplaces/ecc','everything-claude-code','everything-claude-code@everything-claude-code','marketplaces/everything-claude-code'];for(var i=0;i<s.length;i++){r=L(p.join(d,'plugins',s[i]));if(r)return r}try{var g=['ecc','everything-claude-code'];for(var j=0;j<g.length;j++){var c=p.join(d,'plugins','cache',g[j]);var O=f.readdirSync(c);for(var k=0;k<O.length;k++){var q=p.join(c,O[k]);var V=f.readdirSync(q);for(var m=0;m<V.length;m++){r=L(p.join(q,V[m]));if(r)return r}}}}catch(_){}return d})();console.log(r)")}"
node "$EOC_ROOT/scripts/ci/validate-skill-host-compat.js"
```

Inventory counts without failing:

```bash
EOC_ROOT="${EOC_PLUGIN_ROOT:-$(node -e "var r=(function(){var p=require('path'),f=require('fs'),o=require('os');var e=process.env.EOC_PLUGIN_ROOT;if(e&&e.trim())return e.trim();var d=(process.env.EOC_CONFIG_DIR||'').trim()||p.join(o.homedir(),'.config','opencode');if(d==='~')d=o.homedir();else if(d.charAt(0)==='~'&&(d.charAt(1)==='/'||d.charCodeAt(1)===92))d=p.join(o.homedir(),d.slice(2));d=p.resolve(d);function L(x){try{return require(p.join(x,'scripts','lib','resolve-ecc-root')).resolveEccRoot()}catch(_){return null}}var r=L(d);if(r)return r;var s=['ecc','ecc@ecc','marketplaces/ecc','everything-claude-code','everything-claude-code@everything-claude-code','marketplaces/everything-claude-code'];for(var i=0;i<s.length;i++){r=L(p.join(d,'plugins',s[i]));if(r)return r}try{var g=['ecc','everything-claude-code'];for(var j=0;j<g.length;j++){var c=p.join(d,'plugins','cache',g[j]);var O=f.readdirSync(c);for(var k=0;k<O.length;k++){var q=p.join(c,O[k]);var V=f.readdirSync(q);for(var m=0;m<V.length;m++){r=L(p.join(q,V[m]));if(r)return r}}}}catch(_){}return d})();console.log(r)")}"
node "$EOC_ROOT/scripts/ci/validate-skill-host-compat.js" --inventory
```

## Usage

```
/skill-host-compat                 # Fail on substitutions and Codex drift
/skill-host-compat --inventory     # JSON counts, exit 0
/skill-host-compat --strict-checklist
```

## What to Do

1. Run `scripts/ci/validate-skill-host-compat.js` from the EOC root
2. Show ERROR and WARN lines to the user
3. For substitution errors, resolve Claude env vars in the affected Codex/Cursor projection. Rewrite `$EOC_PROJECT_DIR` to `$(pwd)` or an explicit path
4. For Codex-key errors, drop `origin` / `version` / `argument-hint` on the copy
