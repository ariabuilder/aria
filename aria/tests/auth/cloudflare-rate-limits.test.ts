import { describe, expect, it, vi } from "vitest";
import { CloudflareAdapter } from "../../lib/auth/cloudflare-adapter";

describe("Cloudflare auth rate limits", () => {
  it("keeps mutable login and lockout counters out of KV", async () => {
    const db = {
      all: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 1 }])
        .mockResolvedValueOnce([]),
    };
    const kv = {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    };
    const adapter = new CloudflareAdapter(
      db as never,
      {} as never,
      kv as never,
    );

    await adapter.recordLoginAttempt("203.0.113.2");
    await expect(adapter.recordRateLimitBreach("203.0.113.2")).resolves.toEqual(
      expect.objectContaining({ breachCount: 1 }),
    );

    expect(db.all).toHaveBeenCalledTimes(3);
    expect(kv.get).not.toHaveBeenCalled();
    expect(kv.put).not.toHaveBeenCalled();
    expect(kv.delete).not.toHaveBeenCalled();
  });

  it("reads the lockout from D1 rather than KV", async () => {
    const db = {
      all: vi
        .fn()
        .mockResolvedValue([{ count: 2, reset_at: Date.now() + 60_000 }]),
    };
    const kv = {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    };
    const adapter = new CloudflareAdapter(
      db as never,
      {} as never,
      kv as never,
    );

    await expect(adapter.checkLockout("203.0.113.2")).resolves.toMatchObject({
      isLockedOut: true,
      breachCount: 2,
    });
    expect(kv.get).not.toHaveBeenCalled();
  });
});
