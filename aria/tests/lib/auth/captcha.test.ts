import { afterEach, describe, expect, it, vi } from "vitest";

import {
  TURNSTILE_LOGIN_ACTION,
  verifyTurnstile,
} from "../../../lib/auth/captcha";

const baseInput = {
  token: "token-from-widget",
  secretKey: "worker-secret",
  remoteIp: "203.0.113.9",
  expectedHostnames: ["admin.example.com"],
  expectedAction: TURNSTILE_LOGIN_ACTION,
};

describe("verifyTurnstile", () => {
  afterEach(() => vi.restoreAllMocks());

  it("only succeeds for a valid response matching this login action and host", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          hostname: "admin.example.com",
          action: TURNSTILE_LOGIN_ACTION,
        }),
      ),
    );

    await expect(verifyTurnstile({ ...baseInput, fetcher })).resolves.toEqual({
      success: true,
    });
    const [, request] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const body = new URLSearchParams(request.body as string);
    expect(body.get("secret")).toBe("worker-secret");
    expect(body.get("response")).toBe("token-from-widget");
    expect(body.get("remoteip")).toBe("203.0.113.9");
    expect(body.get("idempotency_key")).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it.each([
    [{ success: false, "error-codes": ["invalid-input-response"] }],
    [{ success: true, hostname: "evil.example", action: TURNSTILE_LOGIN_ACTION }],
    [{ success: true, hostname: "admin.example.com", action: "other-form" }],
  ])("fails closed for %#", async (response) => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(response)));
    await expect(verifyTurnstile({ ...baseInput, fetcher })).resolves.toMatchObject({
      success: false,
    });
  });

  it("retries a transient provider failure once with the same idempotency key", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            hostname: "admin.example.com",
            action: TURNSTILE_LOGIN_ACTION,
          }),
        ),
      );

    await expect(verifyTurnstile({ ...baseInput, fetcher })).resolves.toEqual({
      success: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const first = new URLSearchParams(fetcher.mock.calls[0][1].body as string);
    const second = new URLSearchParams(fetcher.mock.calls[1][1].body as string);
    expect(second.get("idempotency_key")).toBe(first.get("idempotency_key"));
  });
});
