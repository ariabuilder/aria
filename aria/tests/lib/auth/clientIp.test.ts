import { describe, expect, it } from "vitest";
import { getClientIp } from "../../../lib/auth/session";

describe("getClientIp", () => {
  it("prefers Cloudflare's authenticated client address", () => {
    const request = new Request("https://example.com", {
      headers: {
        "cf-connecting-ip": "203.0.113.10",
        "x-forwarded-for": "127.0.0.1",
        "x-real-ip": "10.0.0.1",
      },
    });

    expect(getClientIp(request)).toBe("203.0.113.10");
  });

  it("uses forwarded headers for local development", () => {
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "198.51.100.5, 10.0.0.1" },
    });

    expect(getClientIp(request)).toBe("198.51.100.5");
  });
});
