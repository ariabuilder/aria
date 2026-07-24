# `aria/lib` — Core System Libraries

This directory contains **universal libraries** used by both server-side and client-side code in Aria.

## Purpose

Core infrastructure that is:

- **Framework-agnostic** — No Vue, React, or UI-specific dependencies
- **Isomorphic** — Works in both Node.js (local dev) and Edge runtime (Cloudflare Workers)
- **Shared** — Used by server-side code (Astro SSR, actions, middleware) AND client-side code (admin UI)

## Directory Structure

```
aria/lib/
├── blocks/          # Block system (BuilderNode utilities, component expansion)
├── build/           # Build-time utilities (snapshot generation)
├── content/         # Content management utilities
├── events/          # Event system
├── icons/           # Static icon catalog, providers, and SVG rendering
├── middleware/      # Server middleware (context detection, etc.)
├── migrations/      # Data migration utilities
├── rendering/       # Server-side rendering (SSR) helpers
├── routing/         # Routing utilities
├── schemas/         # Zod schemas (PageDSL, LayoutDSL, ComponentDSL)
├── storage/         # Storage adapter abstraction (Local/Cloudflare)
├── types/           # TypeScript type definitions
├── utils/           # General-purpose utilities
└── watcher/         # File watcher (local dev only)
```

## Key Modules

### Storage Abstraction (`storage/`)

- `adapter.ts` — `StorageAdapter` interface
- `sqlite.ts` — SQLiteStorageAdapter (local canonical storage)
- `cloudflare.ts` — CloudflareStorageAdapter (D1 + KV + R2)
- **Used by:** Server actions, API routes, admin UI data loading

### Block System (`blocks/`)

- `nodeUtils.ts` — Component expansion, block manipulation
- **Used by:** Compose action, canvas rendering, editor state management

### Types (`types/`)

- `BuilderNode` — Core block data structure
- `PageDSL`, `LayoutDSL`, `ComponentDSL` — Resource schemas
- **Used by:** Everywhere (server + client)

### Middleware (`middleware/`)

- Context detection (Composer vs Stage vs Public)
- **Used by:** Astro middleware chain

### Icon delivery (`icons/`)

- `staticIconProvider.ts` — reads the versioned static icon manifest, catalogs,
  and shards through an asset fetcher; it never imports an Iconify collection.
- `resolveIconResources.ts` — performs the server-side icon-resolution prepass
  used by published rendering and snapshots.
- `iconRenderResources.ts` and `renderResolvedIcon.ts` — shared resource and
  inline-SVG rendering helpers for HTML, Astro, and browser previews.
- `iconReferences.ts` — pure icon-reference collection shared by browser and
  server paths.
- **Build-time source:** `aria/scripts/generate-icon-assets.ts` is Node-only
  and is the sole importer of `@iconify-json/lucide` and `@iconify-json/cib`.

The generated assets live at
`public/vendor/aria-icons/v1/<snapshot>/`: a manifest points to one catalog and
small prefix-range shards per pack. `generatedIconSnapshot.ts` identifies the
current version. Treat the snapshot as part of rendered output: browser/API
caches and persisted page/component snapshots must invalidate when it changes.

Do not add collection imports, dynamic imports of collections, or icon lookup
logic to Worker-reachable runtime modules. Wrangler packages reachable chunks,
so dynamic imports do not preserve the Worker size boundary. The
`npm run build:icon-boundary` gate enforces this rule; the generator rejects
shards larger than 56 KiB. `coreui-brands:elsevier` is explicitly excluded due
to its exceptionally large SVG payload.

## Import Examples

```typescript
// From server-side code (actions, API routes)
import { getStorageAdapterAsync } from "aria/lib/storage/adapter";
import type { PageDSL } from "aria/lib/types";

// From client-side code (Vue components)
import type { BuilderNode } from "aria/lib/types";
import { expandComponentReferencesServer } from "aria/lib/blocks/nodeUtils";
```

## Constraints

### ✅ DO

- Write framework-agnostic code
- Use Web APIs (`crypto.randomUUID()`, `URL`, `Request`, `Response`)
- Support both Local (Node.js) and Cloudflare (Edge) runtimes
- Export TypeScript types

### ❌ DON'T

- Import Vue/React components
- Use Node.js-specific APIs without polyfills (`fs`, `path`, etc.)
- Add UI-specific utilities (those go in `aria/admin/lib/`)
- Use browser-only APIs without runtime checks

## Related Directories

- **`aria/admin/lib/`** — Admin-UI-specific utilities (DOM, draft cache, responsive utils)
  - These are client-only, UI-framework-specific helpers
  - Example: `cn()` for Tailwind class merging, `domRegistry.ts` for DOM manipulation

- **`src/lib/`** — User's public site utilities (if any)
  - End-user code, not part of the Aria builder system

## Testing

All modules in `aria/lib/` should:

1. Have unit tests in `aria/lib/**/*.test.ts`
2. Work in both Local and Cloudflare environments
3. Pass TypeScript strict mode checks

## Documentation

- Architecture notes should live in this starter repository until public docs are published.
- Type definitions: `aria/lib/types/global.d.ts`

---

**Last Updated:** December 2024  
**Maintainer:** Aria Builder Team
