# Roadmap

Aria Builder is pre-launch and pre-v1. This roadmap is a direction of travel, not a
promise of delivery order or dates.

This readme will be converted into a public roadmap utilizing Github projects in the near future.

## Available today

- Studio and visual Composer on a site you own (Astro-native, local Node or
  Cloudflare).
- A design system for tokens, semantic classes, fonts, and motion — shared by
  previews, publishing, and export.
- Built-in CMS for collections, entries, and media.
- An AI Agent, plus policy-aware Site API and MCP on that same site —
  no Aria-hosted control plane or connection broker.
- One-Click Deploy to Cloudflare; see the
  README quick start for the current verification status).


## Now

- Stabilize Cloudflare & Node runtimes.
- Make sign-in, permissions, and audit trails production-ready across Studio,
  Agent, and Site API.
- Improve CMS, content sync, imports, exports, and media workflows.
- Keep schema upgrades safe and recoverable with clear backup and restore
  paths.
- Prepare the project for outside contributors.
- Stabilize the Site API and document how access and permissions work.

## Before 1.0

- Make install and deploy docs easy to follow.
- Write clearer upgrade notes for people already running pre-v1 builds.
- Grow test coverage across the core paths.
- Make Cloudflare deployments easier to see and debug when something goes wrong.
- Finish docs for the public ways to extend and integrate with Aria.
- Check bundled assets, third-party notices, and export licensing.

## 1.0 Goals

- Deploy an Aria site with confidence — no security landmines, no design or
  layout surprises in the final output.
- A Composer you can trust for real manual site building. AI helps, but the
  canvas and fundamentals have to stand on their own — polished enough to feel
  world-class.
- Edit a real Astro site visually, then own the export. Everything yours.
  Free. Open source. No subscription walls or tiered limits on the core builder.

## Later

- Broader import/export targets.
- Designed site templates and component libraries.
- Deeper agent tooling for design, content, SEO, and maintenance.
- Additional observability and operational workflows for production sites.
- Signed webhooks, durable retries, n8n/Make/Zapier recipes, and Notion
  publishing automation.
- Site-local OAuth device authorization and the direct Figma draft importer.
- An EmDash-style plugin platform with manifests, fine-grained capabilities,
  isolated storage, durable hooks, declarative Studio UI, signed artifacts, and
  Cloudflare/Node sandbox parity. All plugin implementation remains deferred
  until that sandbox policy can be enforced; there is no native fallback.

## Non-Goals Before 1.0

- Long-term support branches.
- Compatibility guarantees for every pre-v1 release.
- An extension marketplace.
- A hosted control plane.
- Paid Pro / Enterprise tiers.
- A central Aria connection broker.
- Extension execution without documented security and runtime requirements.
