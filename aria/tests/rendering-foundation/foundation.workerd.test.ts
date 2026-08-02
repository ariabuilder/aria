import { describe, expect, it } from "vitest";

describe("Rendering v2 workerd runtime attestation", () => {
  it("runs inside the Cloudflare Workers runtime", () => {
    expect(navigator.userAgent).toBe("Cloudflare-Workers");
    expect(globalThis.crypto.subtle).toBeDefined();
    expect(globalThis.caches).toBeDefined();
  });
});
