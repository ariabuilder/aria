import { describe, expect, it } from "vitest";
import { sanitizeDiscoveryReportForReader } from "../../lib/crawl/sanitizeDiscoveryReport";
import type { DiscoveryReport } from "../../lib/crawl/schemas";
import type { SessionUser } from "../../lib/auth/types";

const report: DiscoveryReport = {
  generatedAt: "2026-01-01T00:00:00.000Z",
  siteUrl: "https://example.com",
  rows: [
    {
      pageId: "secret",
      slug: "secret",
      title: "Secret",
      publicPath: "/secret",
      inSitemap: false,
      inLlms: false,
      canonicalOk: true,
      exclusionReason: "password",
    },
  ],
  audits: [],
  health: { score: 80, checks: [] },
  discoverySettings: {
    sitemapMode: "auto",
    robotsMode: "auto",
    includeSitemapInRobots: true,
    llmsMode: "auto",
    discourageSearchEngines: false,
    trailingSlashPolicy: "strip",
    sitemapPingOnPublish: false,
  },
};

function viewer(): SessionUser {
  return {
    id: "viewer",
    username: "viewer",
    email: "viewer@example.com",
    role: "content-editor",
    totpEnabled: false,
    preferences: {},
  };
}

describe("sanitizeDiscoveryReportForReader", () => {
  it("redacts sensitive row details for viewers without editDiscoverySettings", () => {
    const sanitized = sanitizeDiscoveryReportForReader(viewer(), report);
    expect(sanitized.rows[0]?.title).toBe("Restricted page");
    expect(sanitized.rows[0]?.absoluteUrl).toBeUndefined();
    expect(sanitized.rows[0]?.slug).toBe("secret");
  });
});
