---
name: esbuild bundling breaks runtime asset reads
description: Why libraries that read companion data files at runtime fail in the esbuild-bundled api-server, and how to work around it.
---

# esbuild bundling breaks runtime asset reads

The `@workspace/api-server` is bundled to a single `dist/index.mjs` via esbuild
(`build.mjs`) before `node` runs it. esbuild only inlines JS/TS module graph;
**companion data files a dependency reads at runtime via `__dirname` /
`fs.readFileSync` are NOT emitted into `dist/`**, so those reads fail at runtime.

**Concrete incident:** `connect-pg-simple`'s `createTableIfMissing: true` reads
its bundled `table.sql` via `__dirname` to create the session table. After
bundling, that file isn't next to `dist/index.mjs`, so the table was never
created. Symptom was silent: every request got a fresh empty session
(no `csrfToken`, no `userId`) → CSRF 403s and auth 401s even with valid cookies,
plus an occasional 502 when the store error surfaced. No table named `session`
or `user_sessions` existed in Postgres.

**Fix / rule:** do not rely on a dependency's "auto-create from a packaged
SQL/asset file" feature in this bundled server. Perform the work explicitly in
our own code. For sessions: `createTableIfMissing: false` + an idempotent
`ensureSessionTable()` (`CREATE TABLE IF NOT EXISTS ...` matching the schema the
lib expects) awaited at startup before `app.listen()`.

**Why:** keeps behavior identical in dev and prod and independent of how esbuild
lays out `dist/`.

**How to apply:** when adding any server dependency that reads a non-JS file
relative to its own install path at runtime (SQL templates, .node addons,
wasm, templates), assume the bundle won't ship that file. Either mark it
external in `build.mjs`, or replicate the behavior in our code. Native addons
(e.g. `bcrypt`) are already externalized in `build.mjs`; pure-JS deps
(`bcryptjs`) bundle fine.
