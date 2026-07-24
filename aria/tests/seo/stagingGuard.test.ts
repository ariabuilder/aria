import { describe, expect, it } from "vitest";
import {
  isStagingHost,
  parseRequestHostname,
  parseSiteHostname,
  stagingRobotsHeader,
} from "../../lib/seo/stagingGuard";

describe("stagingGuard", () => {
  it("parses site and request hostnames", () => {
    expect(parseSiteHostname("https://Example.com/path")).toBe("example.com");
    expect(parseRequestHostname("Preview.example.com:8787")).toBe(
      "preview.example.com",
    );
  });

  it("detects staging hosts that differ from configured siteUrl", () => {
    expect(isStagingHost("preview.pages.dev", "https://example.com")).toBe(true);
    expect(isStagingHost("example.com", "https://example.com")).toBe(false);
  });

  it("returns staging robots header", () => {
    expect(stagingRobotsHeader()).toEqual({
      "X-Robots-Tag": "noindex, nofollow",
    });
  });
});
