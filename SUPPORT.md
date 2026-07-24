# Support

Aria is pre-launch and pre-v1. Community support is welcome, but there is no
formal support SLA.

## Where to Get Help

- Join the [Aria Discord](https://discord.gg/QvuG5XZPe) for community support
  and troubleshooting.
- Use GitHub issues for reproducible bugs.
- Use GitHub discussions, if enabled, for questions, ideas, and setup help.
- Use pull requests for proposed fixes.

Please include:

- Aria version, commit, or branch.
- Node version.
- Runtime mode: `npm run dev`, `npm run dev:edge`, preview, or deployed
  Cloudflare Worker.
- Relevant Cloudflare services involved: D1, R2, KV, Queues, Durable Objects,
  Workers AI, or email.
- Clear reproduction steps.
- Logs or screenshots, with secrets removed.

## Security Issues

Do not report suspected vulnerabilities in public issues. See
[SECURITY.md](SECURITY.md) for private reporting instructions.

## Pre-v1 Expectations

Before `1.0.0`, breaking changes can happen. Older pre-v1 versions are not
guaranteed to receive fixes or backports.

For production or customer-facing deployments before v1:

- Keep backups before migrations.
- Use least-privilege Cloudflare credentials.
- Rotate secrets after sharing access or changing maintainers.
- Keep deployments close to the latest release.
- Review release notes before upgrading.

## Commercial Support

No commercial support plan is published yet. If one becomes available, this
file will be updated with the official contact path.
