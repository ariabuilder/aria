# Webhook operations

Aria webhooks use D1 or SQLite as their source of truth. Queue messages and
Node worker wakeups accelerate durable rows; they never contain canonical
event payloads. After an event and its outbox row commit together, Cloudflare
requests send a best-effort Queue wakeup. A failed wakeup is logged and the
five-minute reconciliation cron recovers the pending database row.

## Studio operations

Administrators with `manageIntegrations` open **Settings → Integrations** to:

- inspect keyring, egress, Queue, and runtime readiness;
- create an endpoint and copy its signing secret once;
- choose reference or approved published-snapshot disclosure;
- subscribe to event types Aria currently emits;
- pause, reactivate, or disable an endpoint;
- rotate the signing secret with overlap for pinned deliveries;
- inspect recent delivery state and retry terminal deliveries.

Pausing prevents new fanout and holds already-created deliveries. Reactivating
the endpoint lets durable reconciliation resume them. Disabling cancels pending,
claimed, and retry-wait deliveries with an `endpoint_disabled` record; it does
not delete events, attempts, audits, or completed deliveries.
Events committed while an endpoint is paused are not backfilled automatically.

## Required shared configuration

Webhook signing uses the same versioned root keyring as Site API credentials:

```text
ARIA_API_KEYRING_KEY_ID=v1
ARIA_API_KEYRING_KEY_V1=<32 random bytes encoded as base64>
```

Never replace a lost production key automatically. Keep prior numbered keys
while retained credentials or webhook signing-key records reference them.

Outbound delivery is fail-closed. Configure exactly one deployment policy:

```text
ARIA_WEBHOOK_EGRESS_MODE=allowlist
ARIA_WEBHOOK_EGRESS_ALLOWLIST=hooks.example.com,*.automation.example.com
```

or:

```text
ARIA_WEBHOOK_EGRESS_MODE=proxy
ARIA_WEBHOOK_EGRESS_PROXY_URL=https://egress.example.com/webhooks
```

`loopback-development` is accepted only when `NODE_ENV=development` and the
destination is loopback HTTP(S). It is rejected when the environment is
missing or production.

## Cloudflare deployment

`npm run deploy` applies migrations, builds the Worker, and then verifies the
integration Queue topology. It:

1. creates `aria-integration-delivery` and
   `aria-integration-delivery-dlq` when absent;
2. refuses to replace a Queue consumer owned by another Worker;
3. deploys the producer, source consumer, DLQ consumer, and five-minute cron;
4. verifies both Queues are attached to `aria-builder` afterward;
5. verifies the source consumer names the integration DLQ.

Before deploying, the keyring guard checks both Site API credential records and
all webhook signing-key ciphertext. If any required numbered Worker secret is
missing, deployment stops instead of generating replacement key material that
could not decrypt retained data.

The source Queue carries `{ "outboxId": "..." }` or
`{ "deliveryId": "..." }` only. The DLQ records infrastructure exhaustion and
leaves database work recoverable by cron.

## Node deployment

Run the web process and durable worker as separately supervised roles using the
same SQLite file and release:

```text
npm run dev
npm run integrations:worker
```

Production Node delivery requires `ARIA_WEBHOOK_EGRESS_MODE=proxy`. The worker
checks proxy policy, keyring availability, and migrations before reporting
`integration.worker.ready`. It reconciles on startup, handles `SIGTERM` and
`SIGINT`, stops claiming new work, and lets database leases recover unfinished
work after the process exits. Each running worker renews a database heartbeat;
Studio reports Node delivery ready only while at least one heartbeat lease is
current, and a graceful shutdown immediately marks its heartbeat stopped.

The optional `ARIA_INTEGRATION_WORKER_INTERVAL_MS` must be a finite whole-number
duration from 1,000 through 60,000 milliseconds. The default is 5,000.

## Incident procedure

1. Pause the endpoint if the receiver is unhealthy but should later resume.
2. Disable it if pending delivery must be cancelled.
3. Rotate the secret if receiver credentials may be exposed; copy the new
   value immediately.
4. Inspect recent delivery status and HTTP/error classification in Studio.
5. Retry a terminal delivery only after correcting the permanent condition.
6. Confirm pending age falls and attempts finish before closing the incident.

Manual retry changes the canonical database row back to pending and writes an
integration audit event. It does not fabricate a Queue-only retry or discard
attempt history.

## Manual acceptance record

On 2026-07-20, the Cloudflare development deployment was exercised against a
temporary Webhook.site receiver. The check verified endpoint creation,
published CMS event delivery, the expected Aria event/delivery/signature and
timestamp headers, the JSON event envelope with aggregate sequence, and
terminal retry recovery after correcting the receiver path. No receiver URL,
signing secret, token, or payload content is retained in this record.

This confirms the deployed happy path and operator retry path for `0006`. It
does not replace the runtime parity, failure-injection, SSRF, or load gates in
the controlling integration plan.
