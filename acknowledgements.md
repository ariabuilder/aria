# Acknowledgments

Aria Builder stands on a lot of open-source work. This page lists the projects whose
code, assets, or designs we include or adapt — and the licenses that come with
them.

Spot a mistake or a missing credit? Open an issue and we’ll fix it.

Full license texts for bundled assets live in [`licenses/`](licenses/).

---

## Built on Astro

**[Astro](https://astro.build)** is not just a dependency here — it is the
foundation Aria is built on.

Aria is an Astro-native visual builder built as a real Astro project. The
public site, Studio admin, agent, and server layer all run inside it —
wired through SSR, middleware, Actions, and integrations (`@astrojs/vue`,
`@astrojs/cloudflare`, `@astrojs/node`). Builder content is stored as
structured data and rendered through Astro; publishing updates that content
and serves it from the app, and Studio site export can generate `.astro`
page, layout, and component files from it.

That only works because Astro was designed for it. Islands when you need
interactivity. Server rendering by default. First-class TypeScript.
Integrations that meet you where you deploy. Actions and middleware as
first-class citizens. A content-first philosophy that treats the framework
as something you own, not something that owns you.

**Thank you to Fred K. Schott, the Astro core team, and the entire Astro
community** — for building a framework that makes "ship a real project"
feel obvious, for the care you put into developer experience, and for
making it possible for tools like Aria to exist without fighting the grain
of the platform. We are proud to be Astro-native, and we mean it.

**MIT License** — see npm dependencies.

---

## Built with Vue and Vite

**[Vue](https://vuejs.org/)** is the interactive heart of Aria's Builder and
Studio. Its component model, reactivity, and composition API make it
possible for a complex visual editor to stay expressive and maintainable
inside an Astro application.

**[Vite](https://vite.dev/)** powers the fast development and build pipeline
behind that experience, including Aria's Vue integration. The speed of the
feedback loop matters enormously when shaping a tool people use to build.

**Thank you to Evan You, the Vue core team, the Vite team, and their
communities** — for the care, clarity, and performance that make Aria's
interactive surface possible.

**MIT License** — see npm dependencies.

---

## Built for the Cloudflare platform

**[Cloudflare](https://www.cloudflare.com/)** is where Aria is designed to run in
production — and the platform shapes the product as much as Astro does.

Production runs on **Cloudflare Workers** — D1, KV, R2, Queues, Durable
Objects, Workers AI, and Analytics — all wired through
[`wrangler.toml`](wrangler.toml). Traffic metrics live in the Studio;
visitor analytics are optional on published sites.

Local development on Node + SQLite is supported too, but the full platform
story — edge SSR, durable agent sessions, async delivery, and AI at the
binding — is Cloudflare-native.

**Thank you to the Cloudflare team** — for Workers, the developer platform,
and the primitives that let a visual builder ship as a real edge application
without reinventing infrastructure. Aria is built for this stack, and we're
grateful it exists.

Bindings and platform APIs are Cloudflare services — see **Companion
services** below.

---

## Adapted / vendored code

Portions of this project were adapted from or aligned with other
open-source repositories. Their original authors retain copyright over the
adapted portions, under the licenses noted below.

The sources below are under permissive licenses (MIT / Apache-2.0 / ISC),
which permit this use as long as their original copyright and license
notices are preserved.

- **[shadcn-vue](https://www.shadcn-vue.com/)** — UI component patterns and
  scaffolds used in [`aria/admin/components/ui/`](aria/admin/components/ui/).
  **MIT License.** Components are composed with **Reka UI** primitives (see
  npm dependencies).

---

## Runtime libraries (CDN)

These libraries are loaded from CDNs at runtime — not vendored in the
repository.

| Library | Purpose | License |
| --- | --- | --- |
| [@unocss/runtime](https://www.npmjs.com/package/@unocss/runtime) via [jsDelivr](https://cdn.jsdelivr.net/npm/@unocss/runtime) | Admin/studio live preview utility CSS | MIT |
| [Google Fonts](https://fonts.google.com/) (`fonts.googleapis.com`) | Optional typography for sites built with Aria | Per-font (often OFL) |

UnoCSS runtime CDN used in studio page previews:
[`aria/admin/features/Studio/pages/composables/pagePreviewConstants.ts`](aria/admin/features/Studio/pages/composables/pagePreviewConstants.ts).

Published site icons are **not** loaded through Iconify. Lucide and CoreUI
Brands glyphs are compiled into versioned static shards during the package
build, then resolved and inlined as SVG at render time.

---

## Bundled front-end assets

| Asset | Path | License |
| --- | --- | --- |
| [Outfit](https://github.com/Outfitio/Outfit-Fonts) Variable | `aria/admin/assets/fonts/outfit-variable.woff2` | SIL OFL 1.1 — [`licenses/Outfit-OFL.txt`](licenses/Outfit-OFL.txt) |

Admin UI fonts are referenced in
[`aria/admin/styles/globals.css`](aria/admin/styles/globals.css).

---

## Icon sets (build-time)

Icon glyphs are bundled at build time. Admin UI icons use Hugeicons through
UnoCSS via [`uno.aria.config.ts`](uno.aria.config.ts). Published Lucide and
CoreUI Brands icons are compiled into Aria's versioned static assets by
[`aria/scripts/generate-icon-assets.ts`](aria/scripts/generate-icon-assets.ts)
and rendered inline — no Iconify runtime or CDN is used for those sets.
`coreui-brands:elsevier` is intentionally excluded from the supported picker
catalog because its SVG payload is exceptionally large.

| Set | Bundled form | License | Where used |
| --- | --- | --- | --- |
| [Hugeicons](https://icon-sets.iconify.design/hugeicons/) | `@iconify-json/hugeicons` | MIT | Admin UI |
| [Lucide](https://github.com/lucide-icons/lucide) | Versioned static shards under `public/vendor/aria-icons/` | ISC; MIT for Feather-derived glyphs | Published site icons |
| [CoreUI Brands](https://github.com/coreui/coreui-icons) | Versioned static shards under `public/vendor/aria-icons/` | CC0-1.0; third-party trademarks remain with their owners | Published site brand/social icons |

---

## npm dependencies

Direct dependencies from [`package.json`](package.json). A tab-separated
audit listing is in [`licenses/THIRD-PARTY-NPM.txt`](licenses/THIRD-PARTY-NPM.txt).

### Production dependencies

| Package | License |
| --- | --- |
| @ai-sdk/anthropic | Apache-2.0 |
| @ai-sdk/google | Apache-2.0 |
| @ai-sdk/openai | Apache-2.0 |
| @astrojs/cloudflare | MIT |
| @astrojs/vue | MIT |
| @cloudflare/ai-chat | MIT |
| @codemirror/commands | MIT |
| @codemirror/lang-css | MIT |
| @codemirror/lang-html | MIT |
| @codemirror/lang-javascript | MIT |
| @codemirror/lang-json | MIT |
| @codemirror/lang-xml | MIT |
| @codemirror/language | MIT |
| @codemirror/state | MIT |
| @codemirror/view | MIT |
| @floating-ui/dom | MIT |
| @internationalized/date | Apache-2.0 |
| @libsql/client | MIT |
| @modelcontextprotocol/sdk | MIT |
| @simplewebauthn/browser | MIT |
| @simplewebauthn/server | MIT |
| @tanstack/vue-table | MIT |
| @tiptap/extension-link | MIT |
| @tiptap/extension-placeholder | MIT |
| @tiptap/extension-underline | MIT |
| @tiptap/starter-kit | MIT |
| @tiptap/vue-3 | MIT |
| @unocss/astro | MIT |
| @vueuse/core | MIT |
| agents | MIT |
| ai | Apache-2.0 |
| astro | MIT |
| class-variance-authority | Apache-2.0 |
| clsx | MIT |
| codemirror | MIT |
| colord | MIT |
| date-fns | MIT |
| drizzle-orm | Apache-2.0 |
| html-to-image | MIT |
| idb | ISC |
| isomorphic-dompurify | MIT |
| jszip | MIT OR GPL-3.0-or-later |
| marked | MIT |
| nodemailer | MIT-0 |
| otpauth | MIT |
| reka-ui | MIT |
| uuid | MIT |
| vee-validate | MIT |
| vue-input-otp | MIT |
| vue-resizable-panels | MIT |
| vue-router | MIT |
| vue-sonner | MIT |
| vuedraggable | MIT |
| workers-ai-provider | MIT |
| yaml | ISC |
| zod | MIT |

### Development dependencies

| Package | License |
| --- | --- |
| @astrojs/check | MIT |
| @astrojs/node | MIT |
| @iconify-json/cib | CC0-1.0 |
| @iconify-json/hugeicons | MIT |
| @iconify-json/lucide | ISC |
| @iconify/utils | MIT |
| @types/node | MIT |
| @types/nodemailer | MIT |
| @unocss/preset-icons | MIT |
| @unocss/preset-typography | MIT |
| @unocss/preset-wind3 | MIT |
| @unocss/reset | MIT |
| @unocss/transformer-directives | MIT |
| @unocss/transformer-variant-group | MIT |
| @vitejs/plugin-vue | MIT |
| @vitest/ui | MIT |
| @vue/test-utils | MIT |
| esbuild | MIT |
| happy-dom | MIT |
| jsdom | MIT |
| tsx | MIT |
| typescript | Apache-2.0 |
| unocss | MIT |
| vite | MIT |
| vitest | MIT |
| wrangler | MIT OR Apache-2.0 |

---

## Companion services (interoperated with, not bundled)

Aria talks to these over the network or platform APIs. They are **not**
distributed with this project; their licenses do not bind this codebase,
but they deserve credit:

| Service | Purpose | Upstream |
| --- | --- | --- |
| [Cloudflare Workers](https://developers.cloudflare.com/workers/) | Edge deployment | Cloudflare platform |
| [Cloudflare D1](https://developers.cloudflare.com/d1/) | SQL database (edge) | Cloudflare platform |
| [Cloudflare KV](https://developers.cloudflare.com/kv/) | Published HTML snapshots, sessions | Cloudflare platform |
| [Cloudflare R2](https://developers.cloudflare.com/r2/) | Media object storage | Cloudflare platform |
| [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/) | Studio agent sessions (`aria_studio_agent`) | Cloudflare platform |
| [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/) | Built-in agent inference (`ai` binding) | Cloudflare platform |
| [Cloudflare Queues](https://developers.cloudflare.com/queues/) | Async email delivery and thumbnail generation | Cloudflare platform |
| [Cloudflare Analytics](https://developers.cloudflare.com/analytics/) | Studio traffic metrics (GraphQL API) | Cloudflare platform |
| [libSQL](https://github.com/tursodatabase/libsql) | SQL client (`@libsql/client`) | MIT |
| [OpenAI / compatible APIs](https://openai.com/) | Optional BYOK agent inference | Third-party service |
| [Model Context Protocol](https://modelcontextprotocol.io/) | Agent tool surface (`@modelcontextprotocol/sdk`) | Open protocol |
| [Plausible](https://plausible.io/), [Fathom](https://usefathom.com/), [Simple Analytics](https://www.simpleanalytics.com/), [Matomo](https://matomo.org/), [Umami](https://umami.is/), [Google Analytics](https://analytics.google.com/), [Google Tag Manager](https://tagmanager.google.com/), [Meta Pixel](https://www.facebook.com/business/tools/meta-pixel), [TikTok Pixel](https://ads.tiktok.com/), [LinkedIn Insight Tag](https://business.linkedin.com/marketing-solutions/insight-tag) | Optional visitor analytics on published sites (site-owner configuration) | Third-party services |
| [Google Fonts](https://fonts.google.com/) | Optional site typography (site-owner configuration; see Runtime libraries) | Per-font |

Bindings are declared in [`wrangler.toml`](wrangler.toml).

---

### License-compatibility notes (for this repository)

- **Core application dependencies** are overwhelmingly permissive
  (MIT / Apache-2.0 / BSD / ISC). No copyleft package is required to run
  the default local or edge workflows identified above.

- **Outfit (SIL OFL 1.1)** — bundled as the variable font used by the Aria
  admin interface. See [`licenses/Outfit-OFL.txt`](licenses/Outfit-OFL.txt).

- **Google Fonts on published sites** — end-user configuration. Aria
  generates `@import` / `<link>` tags but does not bundle those font files.

- **isomorphic-dompurify** — used for paste sanitization in
  [`aria/lib/blocks/htmlToNodes.ts`](aria/lib/blocks/htmlToNodes.ts);
  wraps DOMPurify (Apache-2.0) with environment-specific DOM implementations.

- **jszip** — dual-licensed (MIT OR GPL-3.0-or-later). Used for site export
  ([`aria/lib/export/generator.ts`](aria/lib/export/generator.ts)); typical
  npm resolution uses the MIT grant.

- **nodemailer (MIT-0)** — SMTP delivery in
  [`aria/lib/email/providers/smtp-node.ts`](aria/lib/email/providers/smtp-node.ts).

- **ai / @ai-sdk/\* (Apache-2.0)** — optional LLM inference for the Studio
  agent; no copyleft impact on distribution.

- **CoreUI Brands (CC0-1.0)** — brand glyph data bundled into published sites;
  trademark rights remain with their respective owners.

- **Transitive tooling** — e.g. `caniuse-lite` (CC BY 4.0, browser data),
  optional native `sharp` libvips bindings (LGPL-3.0-or-later on some
  platforms) may appear in dev/build trees. These do not ship as part of
  the published Aria admin or site runtime unless your deployment pipeline
  pulls them in separately.
