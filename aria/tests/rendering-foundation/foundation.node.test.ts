import { describe, expect, it } from "vitest";

describe("Rendering v2 Node runtime attestation", () => {
  it("runs the foundation suite in Node without Cloudflare globals", () => {
    expect(process.release.name).toBe("node");
    expect("caches" in globalThis).toBe(false);
  });
});
