import { describe, expect, it } from "vitest";
import { DiscoverySettingsSchema, mergeDiscoverySettings } from "../../lib/crawl/schemas";

describe("mergeDiscoverySettings", () => {
  it("lets the saved patch override parsed server defaults", () => {
    const current = mergeDiscoverySettings(undefined, {
      discourageSearchEngines: false,
    });
    const fromServer = mergeDiscoverySettings(current, {
      sitemapMode: "auto",
      robotsMode: "auto",
      llmsMode: "auto",
      discourageSearchEngines: false,
      includeSitemapInRobots: true,
      trailingSlashPolicy: "strip",
      sitemapPingOnPublish: false,
    });
    const merged = mergeDiscoverySettings(fromServer, {
      sitemapPingOnPublish: true,
    });

    expect(merged.sitemapPingOnPublish).toBe(true);
  });

  it("prefers persisted server discovery over client-side re-merge", () => {
    const serverDiscovery = mergeDiscoverySettings(undefined, {
      sitemapPingOnPublish: true,
      discourageSearchEngines: false,
    });
    const staleClient = mergeDiscoverySettings(undefined, {
      sitemapPingOnPublish: false,
    });
    const resolved = serverDiscovery
      ? DiscoverySettingsSchema.parse(serverDiscovery)
      : mergeDiscoverySettings(staleClient, { sitemapPingOnPublish: true });

    expect(resolved.sitemapPingOnPublish).toBe(true);
  });
});
