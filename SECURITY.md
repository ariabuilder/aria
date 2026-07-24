# Security Policy

Aria Builder is pre-launch and pre-v1. It is open source (Apache-2.0), but the
security surface is already real — sign-in, sessions, roles, MCP tokens, email
credentials, storage, media, custom code, and Cloudflare deploy paths all matter.

If you find something that looks wrong, tell us privately first. That gives us
time to verify, fix, and disclose without putting people at risk.

For general questions, setup help, or non-sensitive discussion, join the
[Aria Discord](https://discord.gg/QvuG5XZPe). Keep suspected vulnerabilities
out of public channels.

## Supported Versions

Before `1.0.0`, we focus security work on `main` and the latest published
pre-v1 release.

| Version | Supported |
| ------- | --------- |
| `main` | Yes |
| Latest pre-v1 release | Best effort |
| Older pre-v1 releases | No |
| Forks or modified deployments | No, unless it also reproduces on `main` |

Pre-v1 can change — breaking updates, migrations, security model shifts — without
long-term backports. If you are running Aria before v1, stay current and read
the release notes before you upgrade.

## Reporting a Vulnerability

Do not open a public GitHub issue with exploit details.

How to report:

1. Use GitHub private vulnerability reporting or Security Advisories for this
   repo, if available.
2. Or email `security@ariabuilder.io`.

If you cannot reach us privately, open a public issue that only asks for a
security contact — no payloads, tokens, logs, or reproduction steps.

Helpful reports usually include:

- What you found and where it lives
- The commit, tag, or version you tested
- Steps to reproduce, or a minimal proof of concept
- What an attacker could gain
- Whether you were on local Node or Cloudflare (Workers / D1 / R2 / KV)

Leave real secrets, production data dumps, private user data, and live tokens
out of the report.

## What to Expect

We are pre-launch, so response times are best effort — not a formal SLA.

What we aim for:

- Acknowledge within 5 business days
- Triage severity and confirm we can reproduce it
- Keep you updated when we fix it, ship it, or decline it
- Credit you in the advisory or release notes unless you want to stay anonymous

We may decline reports that only hit unsupported versions, depend on unsafe
local setup, assume an already-compromised admin without crossing a privilege
boundary, or are general hardening tips without a concrete bug.

## Coordinated Disclosure

Give us a fair window to fix and publish before you go public. We will not ask
you to sit on a vulnerability forever.

When something is confirmed, we will share enough for people to judge risk and
upgrade safely — without handing attackers a ready-made recipe.

## Safe Harbor

Good-faith research is welcome. Stay in safe harbor by:

- Testing only systems you own or have permission to test
- Not touching data that is not yours
- Stopping and reporting if you hit sensitive data
- Skipping DoS, spam, social engineering, phishing, and physical attacks
- Not installing backdoors, keeping access open, or blowing past rate limits
  beyond what you need to show the issue

Follow this policy and we will not treat the report as hostile.

## No Bug Bounty

There is no paid bug bounty today. Reports are genuinely appreciated, but do
not expect a reward unless we agree to one in writing.

## Where Reports Help Most

We especially care about issues in:

- Sign-in, sessions, password reset, TOTP, passkeys, or captcha
- Role and capability checks in Studio, Astro Actions, the agent, or MCP
- MCP token issuance, storage, scoping, or replay
- Site API credentials — creation, one-time display, storage, scopes, expiry,
  revocation, key rotation, idempotency, or replay
- XSS in published pages, Studio, CMS content, custom code, SVG, media
  metadata, or previews
- SSRF, open redirects, path traversal, unsafe files, or media upload bypasses
- Secret storage, email credentials, queued email payloads, or key rotation
- Boundaries around D1, SQLite, R2, KV, Queues, Durable Objects, or Workers
- Export / import paths that could leak data or run untrusted content

## Site API and MCP tokens

Site API and MCP live on each site. They do not bypass Aria’s user, role,
capability, collection-policy, or scope checks. Aria does not run a central
connection broker.

- Treat credentials and tokens as secrets. Drop them nowhere public — source
  control, screenshots, logs, issues, client-side code, or URLs.
- Give the least access you need, set an expiry when you can, and revoke
  anything unused or possibly exposed.
- Copy a new Site API credential when you create it. You will not get the full
  value back later.
- Keep the numbered Site API keyring secrets intact across deploys. Losing or
  replacing them can break the assumptions behind stored credentials — revoke
  and rotate on purpose if that happens.
- Use HTTPS outside local development, and check audit records when something
  looks off.

## Shipping security surfaces

Site API credentials, webhooks, and the site-local OAuth device-authorization
preview are present in development and deployable builds when enabled. Report
issues against those surfaces. Design-tool resource APIs (Figma import routes)
and plugins are not shipping yet — discovery still labels Figma
`authorization_preview` until those land.

## Running Aria in production before v1

Until `1.0.0`, treat production as early access. Use least-privilege Cloudflare
credentials, rotate secrets, keep admin access tight, back up before migrations,
and upgrade when security fixes land.
