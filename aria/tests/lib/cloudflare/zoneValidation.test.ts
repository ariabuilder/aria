import { describe, expect, it } from "vitest";

import { hostsAlignWithZone } from "../../../lib/cloudflare/analytics/zoneValidation";

describe("hostsAlignWithZone", () => {
  it("matches apex and www", () => {
    expect(hostsAlignWithZone("www.example.com", "example.com")).toBe(true);
    expect(hostsAlignWithZone("example.com", "example.com")).toBe(true);
  });

  it("matches subdomains of the zone", () => {
    expect(hostsAlignWithZone("blog.example.com", "example.com")).toBe(true);
  });

  it("rejects unrelated hosts", () => {
    expect(hostsAlignWithZone("other.com", "example.com")).toBe(false);
    expect(hostsAlignWithZone("example.org", "example.com")).toBe(false);
  });
});
