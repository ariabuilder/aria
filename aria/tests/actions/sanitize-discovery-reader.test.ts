import { describe, expect, it } from "vitest";
import { sanitizeSiteSettingsForReader } from "../../actions/settings";
import type { SessionUser } from "../../lib/auth/types";

function contributorUser(): SessionUser {
  return {
    id: "user-1",
    username: "contributor",
    email: "contributor@example.com",
    role: "content-editor",
    totpEnabled: false,
    preferences: {},
  };
}

describe("sanitizeSiteSettingsForReader discovery redaction", () => {
  it("omits sensitive discovery fields for viewers without editDiscoverySettings", () => {
    const sanitized = sanitizeSiteSettingsForReader(contributorUser(), {
      siteUrl: "https://example.com",
      discovery: {
        robotsMode: "custom",
        robotsCustom: "User-agent: *\nDisallow: /secret",
        sitemapMode: "custom",
        sitemapCustom: "<urlset></urlset>",
        llmsMode: "custom",
        llmsCustom: "secret llms body",
        includeSitemapInRobots: false,
        googleSiteVerification: "google-token",
        bingSiteVerification: "bing-token",
        discourageSearchEngines: false,
        trailingSlashPolicy: "strip",
        sitemapPingOnPublish: false,
      },
    });

    expect(sanitized.discovery?.robotsCustom).toBeUndefined();
    expect(sanitized.discovery?.sitemapCustom).toBeUndefined();
    expect(sanitized.discovery?.llmsCustom).toBeUndefined();
    expect(sanitized.discovery?.googleSiteVerification).toBeUndefined();
    expect(sanitized.discovery?.robotsMode).toBe("custom");
  });
});
