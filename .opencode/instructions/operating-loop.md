# EOC Operating Loop

Every task runs this loop. Do not skip phases.

```
plan -> test -> implement -> review -> verify -> remember -> improve
```

1. **plan** — Invoke `@planner` (or run `/plan`). Restate requirements,
   assess risks, break into phases. Wait for user confirmation before code.
2. **test** — Invoke `@tdd-guide` (or run `/tdd`). Write the failing test
   first (RED). 80%+ coverage across unit, integration, and E2E.
3. **implement** — Smallest change to green (GREEN), then refactor (IMPROVE).
4. **review** — Invoke `@code-reviewer` immediately after writing or
   modifying code. Fix CRITICAL/HIGH findings. Security-sensitive code also
   goes to `@security-reviewer` (or `/security`).
5. **verify** — Run `/verify`: build, typecheck, lint, tests, security grep,
   diff review. All gates must pass.
6. **remember** — Capture durable knowledge: session notes to memory,
   project knowledge to the project's docs (not duplicated elsewhere).
7. **improve** — Run `/learn` to extract reusable patterns into skills.

> Optimize the context window. Persist everything else.
