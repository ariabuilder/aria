# Contributing to Aria

Thanks for helping build Aria. We are pre-launch and pre-v1 — useful
contributions are welcome, but the core stays intentionally tight.

Docs for contributors live at
[ariabuilder.io/docs/contributors](https://ariabuilder.io/docs/contributors/).
Creator and deploy docs are under
[ariabuilder.io/docs](https://ariabuilder.io/docs/).

## Before you start

- Search issues and PRs before opening a new one.
- For big features, architecture changes, storage migrations, auth, or
  agent/MCP behavior — open an issue first.
- Security problems go private. See [SECURITY.md](SECURITY.md). For general
  chat, join the [Aria Discord](https://discord.gg/QvuG5XZPe).

## Local setup

You need Node.js `>= 22.18.0` and npm.

```bash
npm install
npm run dev
```

These commands are supported directly in Windows Command Prompt and
PowerShell as well as macOS and Linux. WSL and shell-specific environment
assignment syntax are not required.

Open `http://localhost:4321/admin` and create the first admin at
`/admin/setup`.

Cloudflare-parity local:

```bash
npm run dev:edge
```

If local D1/R2 is empty:

```bash
npm run db:migrate:local
npm run push:local-media
```

## Common commands

```bash
npm run check
npm run test
npm run build
```

Use focused tests while you work. Run the broader checks before you open a PR.
CI runs the complete test, check, Cloudflare build, runtime-startup, and package
smoke sequence on both Ubuntu and Windows.

## Project boundaries

The longer architecture notes are in
[project boundaries](https://ariabuilder.io/docs/contributors/project-boundaries/).
The short version:

- Product and editor code lives in `aria/`.
- Public site routes and site integration live in `src/`.
- Server mutations go through Astro Actions.
- Validate external input with Zod at the boundary.
- Use the `StorageAdapter`. Do not reach around it for product reads/writes.
- Keep local SQLite and Cloudflare (D1 / R2 / KV) behavior equivalent where
  you can.
- One design system owns tokens, classes, breakpoints, fonts, and generated
  CSS — do not invent a second source of truth.
- Do not bypass capability checks for Studio, Agent, MCP, or public actions.
- Site API and MCP stay on the site. Do not add a central Aria control plane
  or connection broker.
- Custom code, SVG, imports/exports, media, and generated HTML are
  security-sensitive — treat them that way.
- Webhooks, third-party OAuth, design-tool integrations, and plugins need
  product + security review before anyone builds them.

## Dependencies

Aria runs in two places: local Node/SQLite and Cloudflare Workers.

Before you add a package, say in the PR why the current stack is not enough.
Prefer what we already use — Astro, Vue, Zod, Drizzle, UnoCSS, and whatever is
already in `package.json`.

New dependencies should:

- Work in **both** Node and Workers (`npm run dev` and
  `npm run dev:edge` / `npm run build`)
- Use a **permissive license** (MIT, Apache-2.0, ISC, or BSD). Flag anything
  else so we can review it
- Not duplicate a library we already have for the same job
- Stay small and maintainable

Be extra careful with packages that touch auth, crypto, sessions, HTML
sanitization, email, file parsing, AI/MCP, or network I/O. Justify them and
call out the risk.

If you vendor assets, fonts, or icons from a new source, update
[`acknowledgements.md`](acknowledgements.md) and add license text under
[`licenses/`](licenses/) when required.

Dev-only tools go in `devDependencies`. Do not ship runtime packages you only
need at build time.

## Branches and commits

- Branch from `main` and keep it current before opening a PR
- Short names that describe the work: `fix/login-redirect`,
  `feat/cms-export`, `chore/deps-cleanup`
- One concern per branch and per PR — split stacked work if you need to
- Imperative commit messages: `Fix session expiry on edge`,
  `Add migration for page roles`
- Reference the issue in the commit or PR when there is one

## Pull requests

Small enough to review. Complete enough to trust. One concern per PR. If you
cannot explain the change in a few sentences, it is probably too big.

### AI-assisted work

AI is fine for drafting. The PR is still yours.

Do not dump a model’s entire output into one pull request.
**Oversized or unfocused PRs will not be reviewed.** If it touches dozens of
files, rewrites unrelated code, or mixes features with refactors and drive-by
fixes, expect it to be closed.

Before you open:

- Can someone review this in one sitting?
- Does every file serve the same user-facing goal?
- Would you trust this diff from a teammate?

If not, split it and open the pieces in order.

Include:

- What changed for the user
- Screenshots or a short recording for UI work
- Tests for behavior changes, migrations, capability checks, or regressions
- Migration notes for schema or storage changes
- Security notes when you touch auth, sessions, MCP, email secrets, custom
  code, media, redirects, imports/exports, or Cloudflare bindings

Skip:

- Monolithic AI diffs that change everything at once
- Drive-by formatting on unrelated files
- Big rewrites mixed into product changes
- Quiet changes to deploy, migrations, or content promotion

## Migrations and storage

Be careful here.

- Treat `0001_baseline_schema.sql` as history. Do not edit it for new schema
  work. Add the next forward-numbered migration and keep numbering ordered for
  both D1 and SQLite.
- Do not wipe production content unless the destructive step is explicit and
  documented.
- Never copy sessions in content promotion.
- Be clear when auth, media, or settings ride along in a sync path.
- Stay inside Cloudflare Workers Free limits for the base deploy. The build
  guards Worker gzip size and static assets — leave those checks alone.

## UI

Aria is a dense tool, not a landing page. Prefer predictable controls, compact
layout, and clear empty / loading / error / permission-denied states.

- Reuse the UI primitives and patterns already in the tree
- Keep buttons, menus, dialogs, sheets, and tables consistent with nearby code
- Keep copy short and useful
- Check mobile and desktop when the change is visible

## Comment style

Prefer no comment when names and structure already explain the code.

1. Comment **why**, not what — intent, constraints, tradeoffs, security or
   deploy gotchas.
2. One short sentence (two max). Plain English. No marketing adjectives
   (`comprehensive`, `robust`, `seamless`).
3. No structural theater — no `=====` banners, no Features / Architecture /
   Usage lists, no `@module` / `@version`.
4. JSDoc only when it adds info — constraints, units, examples, `@deprecated`,
   `@default`. Delete JSDoc that restates the identifier.
5. Keep tooling escapes as-is — `@ts-ignore`, `eslint-disable`, Vue typing notes.
6. Same voice in Vue `<!-- -->` and narrative SQL `--` comments.

Good:

```ts
// Option/Alt + letter on macOS often emits a special character, so letter
// keys use event.code
```

```ts
// Avoid top-level await import("cloudflare:workers") — fails Cloudflare
// deploy validation (error 10021)
```

Bad:

```ts
/**
 * History Composable - Command Pattern Undo/Redo System
 *
 * Features:
 * - Command Pattern for reversible operations
 * ...
 * @module aria/admin/composables/useHistory
 */
```

```ts
// =============================================================================
// TYPE DEFINITIONS
// =============================================================================
```

## Pre-v1

Before `1.0.0`, things can break. We try to keep changes understandable and
documented, but we do not promise long-term support or backports for older
pre-v1 releases.

## Trademarks

Contributions are under Apache-2.0. That does not grant trademark rights to
the **Aria** or **Aria Builder** name or logos. See
[TRADEMARKS.md](TRADEMARKS.md) for attribution, fork naming, and logo use.
Forks and modified deployments must not imply official status or endorsement
by Statice Origins Inc.

## License

By contributing, you agree your contribution is licensed under the
[Apache License, Version 2.0](LICENSE).
