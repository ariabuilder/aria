# Aria Engineer capability and control map

What the Agent can execute, what the model sees up front, and the guardrails
that have to be in place before something counts as supported.

For the external MCP surface, see [aria-mcp.md](./aria-mcp.md).

## How it fits together

1. `SERVER_TOOL_NAMES` is the full executable inventory (154 commands today).
2. `SERVER_TOOL_INPUT_ZOD_SCHEMAS` is the Zod input contract for each one.
   Studio and MCP schemas are checked against it.
3. `buildServerAiTools` builds what the current user, workspace profile, and
   transport are allowed to use.
4. Studio models get a small **direct** tool set (kept under 30). Everything
   else allowed in the session is reached through `aria_search_commands` →
   `aria_describe_command` → `aria_execute_command`.
5. Every run goes through one kernel: scope checks, rate limits, confirmation,
   mutation capture, activity logging, operation IDs.
6. Admin-only observability tools require an administrator session and are
   Studio-only — never listed or callable over MCP.

Workspace profiles (`studio`, `composer`, `design`, `mcp`) decide which
categories are registered. Individual tools still fail closed on capability
checks inside the handlers.

## Inventory (154)

| Area | Count | Notes |
| --- | ---: | --- |
| Site/content reads | 37 | Context, discovery, analytics, page history, Library, exports, media/sync state |
| CMS reads | 12 | Inventory, entries, relations, revisions, diffs, review/annotations |
| Design writes | 7 | Patch preview/apply plus legacy full-section saves and templates |
| Settings writes | 5 | Capability-gated, schema-validated |
| Content/media/ops writes | 38 | Pages, nodes, media, redirects, Library, exports, transforms, plan/apply sync |
| CMS writes | 21 | Collections, entries, translations, review, bindings, setup flows |
| Classes / variables / fonts | 15 | `mcp:design`; deletes classified as destructive |
| Publishing lifecycle | 7 | Always confirmed |
| Studio-only administration | 12 | System/cache/platform, users, auth/2FA, sanitized email — excluded from MCP |

## Studio vs MCP surfaces

Same kernel, different packaging.

**Studio** — compact direct tools for the common path, plus discover/execute for
the rest. With a live Composer canvas (`canClientInsert`), server-side
`aria_insert_nodes` / `aria_mutate_node` / `aria_update_node_motion` /
`aria_save_document` stay out of the direct set so the model uses browser
client tools and the canvas stays in sync. Studio can also list/call approved
**read-only** third-party MCP tools (`aria_list_external_mcp_tools`,
`aria_call_external_mcp_read`); treat those results as untrusted input.

**MCP** — eight curated tools (`aria_get_site_context` and the `aria_manage_*`
/ `aria_publish` groups). Clients pick an `operation` + `input`; token scopes
gate execution. Details in [aria-mcp.md](./aria-mcp.md).

## Design-system writes

Preferred path:

1. `aria_get_design_system` with `detail: "full"` — save-ready sections and a
   SHA-256 `revision`.
2. `aria_preview_design_system_patch` — RFC 7396-style merge patch, field-level
   diff, proposed revision (rejects a stale `expectedRevision`).
3. `aria_apply_design_system_patch` with the same `expectedRevision` and a
   unique `idempotencyKey`.
4. Server validates every resulting section, rejects stale revisions, records
   idempotency, verifies the saved revision, and rolls back earlier sections if
   a later one fails.

`aria_save_design_system_*` still exist as full-section escape hatches: copy
the save-ready section from `detail: "full"` and preserve every unchanged field.
`aria_set_design_system_primary_color` is fine for a single-color ask.

### Field ownership

| Section | Owns | Does not own |
| --- | --- | --- |
| `colors` | palettes, primary and semantic colors | element-level text/background defaults |
| `typography` | body/heading/mono families, type scale, family overrides keyed by scale token | h1–h6 style objects, weights, transforms, colors, margins |
| `globalStyles` | body, heading, paragraph, link, button, input, section, container, root, CSS-variable defaults | type-scale definitions |
| `breakpoints` | ordered viewport definitions | responsive node rules or class rules |

`headingOverrides` / `bodyOverrides` are font-family strings keyed by scale
token — not `{ size, weight }` objects. Shared heading CSS lives under
`globalStyles.defaults.heading`.

## Cross-environment sync

Content and media sync are plan → apply:

- **Plan** — durable dry run with conflicts and an item summary.
- **Apply** — needs the plan job ID, an idempotency key, and bulk-operation
  confirmation.
- Status/history reads are available before and after.

## Safety

Each command exposes via describe/search:

- auth scope (`mcp:read` / `write` / `design` / `publish`)
- risk: read / write / destructive / publish
- confirmation: never or always (+ category)
- reversibility: exact / compensating / none
- external side effect (publish tools)

**Exact undo** only for tools that capture a full pre-mutation document
snapshot (`aria_save_document`, node insert/mutate/move/delete/replace/classes/
motion/slots, `aria_attach_media_to_node`). Design, settings, Library, export,
transform, and sync writes do not claim exact undo just because an inverse
might exist.

Always confirmed: deletes in the confirmation registry, CSS variable bulk
replace, publish lifecycle, content/media sync apply. Studio completes that
via an approval card; MCP returns `CONFIRMATION_REQUIRED` (see MCP doc).

## Studio streaming

A run must finish with a terminal result — success or an actionable error —
never hang on “Thinking…”.

WebSocket client watchdogs:

- accept: 15s (`AGENT_WS_ACCEPT_TIMEOUT_MS`)
- first model event after accept: 130s (`AGENT_WS_FIRST_MODEL_EVENT_TIMEOUT_MS`)

## Adding a capability

Not Agent-supported until all of this is true:

- Zod schema in the exhaustive inventory
- handler reuses the product action/service and its auth checks
- policy, domain, transport surface, and confirmation are explicit
- search/describe return a useful description and exact schema
- MCP gets it (as an operation under the curated groups) when it is meant to be
  MCP-safe
- partial reads fail loudly instead of returning empty success
- writes that can be replayed or race get conflict/idempotency controls
- tests cover schema parity, auth surface, and failure paths
- production direct-tool budget stays under 30

## Out of bounds

No unrestricted OS, database, credential, email-send, auth-policy,
deployment-provider, or arbitrary network-write access. Admin reads in those
areas are purpose-built, redacted, Studio-only, and audited. Mock deployment
actions are not real capabilities.
