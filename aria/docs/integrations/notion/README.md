# Aria publish → Notion data source

Status: reference recipe (`aria-to-notion@1`). This is a one-way automation,
not a native connector. Aria remains the source of truth.

## Outcome

Each `cms.entry.published.v1` event creates or updates exactly one Notion page.
Duplicate deliveries are safe, older aggregate sequences are ignored, and no
Notion edit can write back to Aria.

This recipe requires Aria migrations `0005` and `0006`. Configure a webhook
endpoint in **Settings → Integrations** with:

- event: `cms.entry.published.v1`;
- payload mode: `published_snapshot`;
- an HTTPS destination allowed by the deployment's fail-closed egress policy;
- the signing secret stored in the automation service's encrypted credential
  store.

No Site API token or Aria API scopes are required for this snapshot recipe.
The automation provider owns its Notion credential. Aria never receives a
Notion token.

## Required Notion schema

Create a Notion data source with these properties:

| Property        | Type      | Purpose                                                      |
| --------------- | --------- | ------------------------------------------------------------ |
| `Name`          | title     | Published Aria title                                         |
| `Aria ID`       | rich text | Unique `<siteId>:<collectionId>:<entryId>:<locale>` identity |
| `Aria Version`  | rich text | Opaque committed entry version                               |
| `Aria Sequence` | number    | Last applied per-entry event sequence                        |
| `Aria Event ID` | rich text | Last applied immutable event ID                              |
| `Aria Source`   | select    | Fixed value `Aria`                                           |

Use the data source ID, not the legacy database ID. Current Notion APIs query a
data source with `POST /v1/data_sources/{id}/query`, create a row with
`POST /v1/pages`, and update it with `PATCH /v1/pages/{page_id}`. Pin the
`Notion-Version` header to the version tested by the workflow (currently
`2026-03-11`). See Notion's [data source guide](https://developers.notion.com/guides/data-apis/working-with-databases)
and [create-page reference](https://developers.notion.com/reference/post-page).

## Certified processing algorithm

1. Preserve the exact raw HTTP body.
2. Reject timestamps older than five minutes.
3. Compute lowercase hex HMAC-SHA256 over
   `v1:<timestamp>:<event-id>:<raw-body>` and compare it in constant time with
   `X-Aria-Signature`.
4. Reject any event type except `cms.entry.published.v1`.
5. Serialize execution by `siteId + aggregate.type + aggregate.id`. A sequence
   check without serialization is not sufficient.
6. Query the Notion data source for exact `Aria ID`.
7. Zero matches: create a page. One match: compare markers and update only if
   the incoming sequence is greater. More than one match: stop with a permanent
   configuration error.
8. Treat the same event ID or sequence as a successful replay. Treat a lower
   sequence as stale and make no Notion request.
9. Write the title, body, version, sequence, and event ID in the same logical
   provider operation. Preserve the Aria event ID as the retry identity.

The receiver must use the immutable `data` snapshot, never fetch mutable
current content during this workflow. The shipped snapshot contains the entry
identity/version and the published source locale's locale, title, slug, and
body. It deliberately excludes arbitrary frontmatter and administrative data.

## Provider setup

### n8n

Use a Webhook trigger behind a user-owned verification edge that forwards only
verified requests, unless your deployed n8n version and configuration can prove
that the Code node receives the exact unmodified raw bytes. Set workflow
concurrency to one or route by Aria aggregate ID into a serialized worker. Then:

1. HTTP Request: query the Notion data source with an exact `Aria ID` filter.
2. If: branch on zero, one, or multiple matches.
3. If one: compare `Aria Sequence` and `Aria Event ID`.
4. Notion or HTTP Request: create/update the page.
5. Respond to Webhook only after the Notion operation succeeds.

Do not describe a direct n8n workflow as signature-verified when raw-body
preservation has not been proven on that deployment.

### Make and Zapier

Place the same verifying edge before the provider unless it exposes the exact
raw request bytes and constant-time HMAC comparison. Enable the provider's
single-concurrency/serialized execution feature for this workflow. If neither
guarantee is available, the recipe is unsupported rather than best-effort.

## Retry ownership

- Aria retries remote timeouts, `408`, `425`, `429`, and `5xx`, and stores every
  attempt durably.
- The automation provider may retry a failed Notion operation, but must retain
  the same Aria event ID and re-run the identity/sequence check.
- Notion `429` uses its bounded retry metadata. Mapping errors and duplicate
  `Aria ID` rows are permanent failures requiring an operator.
- Aria terminal delivery state and the provider's failed-run view are separate
  dead-letter records correlated by event ID.

## Smoke test

1. Publish a new entry; confirm one Notion page and sequence `1`.
2. Replay the webhook; confirm no additional Notion write.
3. Publish an update; confirm the same page advances to sequence `2`.
4. Deliver sequence `1` again; confirm it is ignored as stale.
5. Create a duplicate `Aria ID`; confirm a visible permanent failure.
6. Return `429`, then `500`, then `200`; confirm bounded retries and one final
   page state.
7. Alter one raw body byte; confirm signature rejection before Notion access.
8. Rotate the Aria signing secret; confirm existing pinned deliveries still
   verify with their original key and new deliveries use the new key.

## Disconnect

Pause or disable the Aria webhook endpoint, remove the provider workflow, and
revoke the provider's Notion connection. Rotating the Aria signing secret also
invalidates any copied secret for future deliveries. Existing Notion pages are
content and are not deleted automatically.

See [recipe.json](./recipe.json) for the machine-readable contract and
[example-event.json](./example-event.json) for a redacted payload fixture.
Operational configuration and incident procedures are documented in the
[webhook operations guide](../webhooks/operations.md).
