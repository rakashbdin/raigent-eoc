# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.1.x | Yes |

EOC tracks OpenCode v2. Security fixes land on `dev` and are tagged on `main`.

## Reporting a vulnerability

**Do not open a public issue for a security vulnerability.**

Report privately through your host's security advisory feature (for example,
GitHub's *Security → Report a vulnerability*), or contact the maintainer
directly. Include:

- A description of the issue and its impact.
- Steps to reproduce, with the OpenCode version (`opencode --version`) and OS.
- Any relevant `[EOC]` log lines, with secrets and file contents redacted.

You will get an acknowledgement, a triage decision, and — for accepted issues —
a fix and coordinated-disclosure timeline.

## Security model

EOC runs as an OpenCode plugin and ships configuration content; it does not run
a network service, hold credentials, or store secrets.

- **Permission hook is observation-only.** `ctx.permission.hook("evaluate")`
  logs the decision but never changes its effect. EOC deliberately does **not**
  auto-approve reads or test runs. OpenCode's own permission rules remain the
  single source of truth, so installing EOC cannot widen what an agent may do.
- **No secrets in the repo.** The ported skills and rules contain no
  credentials. If you find one, report it privately as above.
- **Shell environment injection is additive.** The plugin adds informational
  variables (`EOC_*`, `PROJECT_ROOT`, detected languages) to shell commands. It
  never removes or overrides the user's environment, and it does not set
  secrets.
- **Subprocesses are bounded.** Notification and tool subprocesses run through
  `node:child_process.execFile` with timeouts and output caps.
- **The plugin has no runtime dependencies**, so there is no third-party
  supply-chain surface inside `.opencode/`.

## Scope

In scope: the plugin, the custom tools, the `eoc` CLI, and the ported
skills/rules.

Out of scope: OpenCode itself (report upstream), and the upstream
[ECC](https://github.com/affaan-m/ECC) project.
