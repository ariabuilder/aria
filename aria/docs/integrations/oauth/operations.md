# OAuth preview operations

The site-local OAuth server is disabled by default. Its issuer is always an
explicit site origin; request host headers never select or rewrite it.

## Configuration

Apply `0007_oauth_provider.sql`, retain every API keyring version referenced by
OAuth records, and configure:

```text
ARIA_OAUTH_ENABLED=true
ARIA_CANONICAL_ORIGIN=https://site.example.com
ARIA_API_KEYRING_KEY_ID=v1
ARIA_API_KEYRING_KEY_V1=<32 random bytes encoded as base64>
```

`ARIA_CANONICAL_ORIGIN` must be exactly one HTTPS origin with no credentials,
path, query, or fragment. HTTP is accepted only for an explicit loopback
development origin while `NODE_ENV=development`. A request received on another
origin is rejected instead of deriving issuer URLs from that request.

## Preview surface

- `GET /.well-known/aria-integrations` returns cache-disabled wildcard-CORS
  discovery and the immutable site identity.
- `POST /oauth/device/authorization` creates ten-minute, digest-only device and
  user codes for the built-in `aria-figma-plugin` client.
- `GET /oauth/device` provides a minimal signed-in review page. Codes are
  submitted in request bodies, never URLs.
- approval can narrow scopes and cannot exceed the current user's site
  capabilities;
- `POST /oauth/token` enforces polling intervals and single-owner exchange into
  one short-lived access token and one rotating refresh token. The same endpoint
  accepts `grant_type=refresh_token`, consumes exactly one generation, and
  returns replacement access and refresh tokens.
- `POST /oauth/revoke` returns a generic success response for known or unknown
  token values. Revoking an access token affects only that token; revoking a
  refresh token revokes its whole family and all family-linked access tokens.
- discovery publishes the absolute `revocationEndpoint` alongside the device
  and token endpoints.
- the internal Figma resource-authentication seam accepts only OAuth access
  tokens (never Site API tokens or cookies), validates the complete persisted
  authority chain, reconstructs the current site user, and rechecks the
  capability floor for every required provider scope.
- Studio → Integrations lists active connected-app grants without token
  material. Disconnect revokes the grant, every family-linked token, and any
  approved exchange for that principal/client.
- Cloudflare scheduled reconciliation and the supervised Node integration
  worker both run bounded OAuth maintenance as an isolated scheduled subsystem
  (separate from webhook reconciliation so a webhook failure cannot skip
  expiry/retention). Terminal device records are kept
  for seven days; revoked or expired token families and grants are retained for
  90 days, while expired idempotency and audit rows use their explicit expiry.

Discovery reports `authorization_preview` and no Figma import schema versions.
Do not treat this as a production client contract yet: no Figma resource route
is enabled until `0008`.

Clients must replace their stored refresh token after every successful refresh.
If a response is lost, reconnect through device authorization instead of
retrying a refresh token whose consumption state is unknown. Disconnect should
call `/oauth/revoke` and clear local token storage even if the network request
fails.

## Deployed D1 acceptance

The local implementation gates are complete. Before changing discovery from
`authorization_preview`, run this acceptance sequence against a non-production
Cloudflare deployment with real D1 and the normal Worker binding:

1. Apply migrations with `npm run db:migrate:remote`, deploy the Worker, and
   confirm discovery returns the expected immutable site ID and canonical
   origin.
2. Complete one device approval and verify the exchange returns digest-backed
   access and refresh tokens without cleartext token material in D1.
3. Refresh once, verify the old refresh generation returns `invalid_grant`, and
   confirm replay revokes the family and its access tokens.
4. Reconnect, confirm the previous family is revoked, then disconnect from
   Studio and confirm the grant and every linked token are revoked.
5. Trigger scheduled reconciliation and verify expired device/family state is
   transitioned and retention deletes only records beyond its configured
   windows.
6. Confirm a deploy refuses to remove any numbered API keyring secret still
   referenced by a device code, access token, or refresh token.

Record only the acceptance date, environment label, pass/fail outcomes, and
safe record counts. Do not retain site URLs, user data, codes, tokens, or key
material in the acceptance record.

### Acceptance record: 2026-07-21

Environment: development Cloudflare Worker and remote D1.

| Gate | Outcome | Safe evidence |
| --- | --- | --- |
| Migration, deploy, discovery | Pass | No pending migrations; immutable site identity and canonical origin matched configured values |
| Device approval and exchange | Pass | One consumed authorization produced one access and one refresh record; persisted values used 12-character prefixes and 43-character digests with no cleartext-like token value |
| Refresh rotation and replay | Pass | Access and refresh values both rotated; replay returned `invalid_grant`; two access and two refresh records in the compromised family were revoked |
| Reconnect and Studio disconnect | Pass | Reconnect produced one fresh active family; Studio disconnect left one grant, two families, three access records, and three refresh records revoked, with zero active authority; the disconnected refresh token returned `invalid_grant` |
| Scheduled expiry and retention | Pass | Five past-due device authorizations transitioned to `expired`; a later run deleted the one record beyond seven days and retained all four recent expired records |
| Deployment key protection | Pass | Remote OAuth state referenced one numbered key across 20 protected records; the deployment guard test harness refused the referenced key's omission |

The pass exposed and corrected two deployment-only integration defects before
the record was marked complete:

- public form-encoded OAuth protocol POSTs now have a narrow origin-check
  exemption while signed-in decisions and all other form submissions retain
  same-origin enforcement;
- scheduled publication no longer feeds runtime `cacheLocals` into its strict
  serializable-options schema, and scheduled subsystems now continue in order
  after an earlier subsystem fails before reporting the aggregate failure.

## Disable and recovery

Set `ARIA_OAUTH_ENABLED=false` (or remove it) and redeploy to hide discovery and
deny OAuth endpoints without deleting state. Do not remove keyring versions
while device, access, or refresh records still reference them. Database rollback
is not the normal recovery path; follow-up corrections use a new forward
migration.
