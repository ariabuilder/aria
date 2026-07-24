# Aria MCP Server

Each site hosts its own MCP endpoint. There is no central Aria broker.

MCP is the agent-facing transport (Cursor, Claude Desktop, etc.). The Site API
(`/api/v1`) is the REST side for conventional integrations. Both sit on the
site, both enforce Aria auth and capabilities. Studio-only admin tools never
show up here.

## Endpoint

- **URL:** `https://{your-site}/mcp` (local: `http://localhost:4321/mcp`)
- **Transport:** MCP Streamable HTTP
- **Auth:** `Authorization: Bearer aria_mcp_…`

MCP starts disabled. Creating the first token turns it on (`mcpEnabled`). There
is no separate switch.

## Surface

Clients see a small curated set, not every server command as its own tool:

| Tool | Covers |
| --- | --- |
| `aria_get_site_context` | Compact site map — call this first |
| `aria_manage_site` | Settings, localization, discovery, analytics/traffic, redirects |
| `aria_manage_documents` | Pages, layouts, components, nodes, motion, SEO/meta |
| `aria_manage_content` | CMS collections, entries, translations, revisions, reviews |
| `aria_manage_design` | Design system, classes, CSS variables, fonts |
| `aria_manage_media` | Media library, transforms, usage, media sync |
| `aria_manage_library_and_sync` | Library packs, site exports, content sync |
| `aria_publish` | Publish / unpublish / archive for pages and entries |

Grouped tools take:

```json
{
  "operation": "aria_read_page",
  "input": { "slug": "home" }
}
```

`operation` is one of the underlying server commands. Token scopes still decide
what actually runs — missing scope fails at execution, even if the tool is
listed.

For motion edits, prefer `aria_manage_documents` → `aria_update_node_motion`
with `collection`, `slug`, `nodeId`, and `motion`. Check
`aria_get_node_capabilities` first when you need the schema.

Before class work, read `aria_get_site_context` and respect
`styling.utilityClassesAllowed`.

## Scopes

| Scope | What it unlocks | Who can grant it |
| --- | --- | --- |
| `mcp:read` | Reads across site, documents, CMS, design, media, library/sync | `useStudioAgent` |
| `mcp:write` | Content/CMS/media/redirect/library/sync writes | `editPages` or `editCms` |
| `mcp:design` | Design system, classes, variables, fonts, site settings | `editSiteSettings` |
| `mcp:publish` | Publish / unpublish / archive | `publishContent` |

Redirect writes also need **Manage redirects** at execution time. That is a
capability check on the actor, not a separate MCP scope.

## Tokens

Settings → **Aria MCP** (Automation group).

- **Personal token** — tied to you; scopes capped by your role
- **Service token** — site-level, still capped by the creator's role (no
  escalation). Needs `editAgentSettings` to create.

New tokens start with `mcp:read`. Toggle write/design/publish on the token
afterward. The raw secret is shown once — copy it immediately.

Treat it like a site credential: least privilege, HTTPS outside local, keep it
out of git and logs, revoke if it may have leaked.

## Confirmation

High-impact server commands always hit the confirmation gate (same kernel as
Studio):

- Deletes (documents, nodes, media, redirects, collections, entries, classes,
  custom fonts, library uninstall, site exports, media transform variants)
- `aria_manage_css_variables` (bulk replace)
- Publish lifecycle (`aria_publish_*`, `aria_unpublish_*`, `aria_archive_*`,
  `aria_unarchive_page`)
- Bulk sync applies (`aria_apply_content_sync`, `aria_apply_media_sync`)

In Studio, the Agent shows an approve/deny card and retries with a short-lived
confirmation token. Over MCP, those calls return `CONFIRMATION_REQUIRED` and
do not complete through the MCP transport alone.

## Content localization

Studio UI language is a per-user preference. Content localization is
site-owned: default locale, enabled variants, fallback chains.

To translate a CMS entry:

1. `aria_manage_content` → `aria_get_entry_translation_context` with
   collection, entry, and target locale. You get the canonical source, variant
   states, and the field manifest.
2. Translate only `translatableFields`. Leave slugs alone by default. Same for
   media, relations, IDs, URLs, enums/config, placeholders, and structured
   content shape.
3. `aria_manage_content` → `aria_save_entry_translation` with
   `mode: "create_missing"`. Use `update_existing` only when the user
   explicitly wants to replace an existing variant.
4. Re-read to verify. Translation writes keep the entry's publication status.

Always translate from the canonical source locale — never from another
translation or fallback-rendered content.

AI translation writes store a source-content hash and which fields were
translated. Context reports a variant as `stale` when the source changed since
that write; refresh with `update_existing` only when asked.

## Cursor example

```json
{
  "mcpServers": {
    "aria-builder": {
      "url": "http://localhost:4321/mcp",
      "headers": {
        "Authorization": "Bearer aria_mcp_YOUR_TOKEN"
      }
    }
  }
}
```

Settings → Aria MCP can copy a ready-made config with the live site URL.
