# Summary

Describe the change and why it belongs in Aria.

## Checklist

- [ ] I ran the relevant checks or tests.
- [ ] I added or updated tests where behavior changed.
- [ ] I updated docs or release notes when needed.
- [ ] I checked local Node behavior when the change affects runtime behavior.
- [ ] I checked Cloudflare-parity behavior when the change affects bindings,
      storage, deployment, queues, Durable Objects, or Workers APIs.

## Architecture

- [ ] Server mutations go through Astro Actions.
- [ ] External input is validated at the boundary.
- [ ] Storage access respects the `StorageAdapter` boundary.
- [ ] Studio, Agent, MCP, and public routes keep capability checks intact.
- [ ] Design-system changes preserve the canonical source of truth.

## Security Notes

Does this touch auth, sessions, capabilities, MCP, email secrets, custom code,
media, redirects, imports, exports, generated HTML, or Cloudflare credentials?

Explain the risk and mitigation, or write `No security-sensitive areas touched`.

## Screenshots

Add screenshots or recordings for visible UI changes.
