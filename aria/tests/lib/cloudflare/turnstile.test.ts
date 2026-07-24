import { describe, expect, it, vi } from "vitest";
import {
  createManagedTurnstileWidget,
  deleteTurnstileWidget,
  resolveTurnstileAccountId,
} from "../../../lib/cloudflare/turnstile";

describe("Cloudflare Turnstile widget API", () => {
  it("creates a managed widget and keeps the secret in the server result", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ success: true, result: { sitekey: "site-key", secret: "provider-secret" } })),
    );
    await expect(
      createManagedTurnstileWidget({
        apiToken: "worker-only-token",
        accountId: "account-id",
        name: "Aria password login",
        domains: ["admin.example.com"],
        fetcher,
      }),
    ).resolves.toEqual({ siteKey: "site-key", secretKey: "provider-secret" });

    const [url, request] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/accounts/account-id/challenges/widgets");
    expect(request.headers).toMatchObject({ Authorization: "Bearer worker-only-token" });
    expect(JSON.parse(request.body as string)).toEqual({
      domains: ["admin.example.com"],
      mode: "managed",
      name: "Aria password login",
    });
  });

  it("uses the site key when rolling back a newly-created widget", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ success: true })));
    await deleteTurnstileWidget({
      apiToken: "worker-only-token",
      accountId: "account-id",
      siteKey: "site-key",
      fetcher,
    });
    const [url, request] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/widgets/site-key");
    expect(request).toMatchObject({ method: "DELETE" });
  });

  it("discovers the only account available to an account-scoped token", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ success: true, result: [{ id: "account-id" }] })),
    );
    await expect(
      resolveTurnstileAccountId({ apiToken: "worker-only-token", fetcher }),
    ).resolves.toBe("account-id");
    await expect(
      resolveTurnstileAccountId({
        apiToken: "worker-only-token",
        accountId: "configured-account",
        fetcher,
      }),
    ).resolves.toBe("configured-account");
  });
});
