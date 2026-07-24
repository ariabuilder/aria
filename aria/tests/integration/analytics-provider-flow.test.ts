import { describe, expect, it } from "vitest";
import type {
  AnalyticsProviderId,
  AnalyticsSettings,
} from "../../lib/storage/adapter";
import { compileAnalyticsScripts } from "../../lib/analytics/compileAnalyticsScripts";

type ProviderCase = {
  id: AnalyticsProviderId;
  fields: Record<string, string>;
  headContains: string[];
  bodyStartContains?: string[];
  cspScriptSrc?: string[];
  cspConnectSrc?: string[];
  cspImgSrc?: string[];
  cspFrameSrc?: string[];
  usesInlineScript?: boolean;
};

function buildAnalytics(
  activeProviders: AnalyticsProviderId[],
  providers: AnalyticsSettings["providers"],
): AnalyticsSettings {
  return {
    version: 1,
    activeProviders,
    providers,
  };
}

describe("analytics provider flow", () => {
  it("compiles scripts for active providers with valid fields", () => {
    const cases: ProviderCase[] = [
      {
        id: "plausible",
        fields: { domain: "example.com" },
        headContains: [
          "plausible.io/js/script.js",
          'data-domain="example.com"',
        ],
        cspScriptSrc: ["https://plausible.io"],
      },
      {
        id: "fathom",
        fields: { siteId: "ABCDE" },
        headContains: ["cdn.usefathom.com/script.js", 'data-site="ABCDE"'],
        cspScriptSrc: ["https://cdn.usefathom.com"],
      },
      {
        id: "simple-analytics",
        fields: {},
        headContains: ["scripts.simpleanalyticscdn.com/latest.js"],
        cspScriptSrc: ["https://scripts.simpleanalyticscdn.com"],
      },
      {
        id: "matomo",
        fields: { baseUrl: "https://analytics.example.com", siteId: "1" },
        headContains: [
          "setTrackerUrl",
          "https://analytics.example.com/",
          "setSiteId",
          "matomo.js",
        ],
        cspScriptSrc: ["https://analytics.example.com"],
        cspConnectSrc: ["https://analytics.example.com"],
        usesInlineScript: true,
      },
      {
        id: "umami",
        fields: { websiteId: "94db1cb1-74f4-4a40-ad6c-962362670409" },
        headContains: [
          "cloud.umami.is/script.js",
          'data-website-id="94db1cb1-74f4-4a40-ad6c-962362670409"',
        ],
        cspScriptSrc: ["https://cloud.umami.is"],
        cspConnectSrc: ["https://cloud.umami.is"],
      },
      {
        id: "tiktok-pixel",
        fields: { pixelId: "A1B2C3D4" },
        headContains: ["analytics.tiktok.com/i18n/pixel/events.js", "A1B2C3D4"],
        cspScriptSrc: ["https://analytics.tiktok.com"],
        usesInlineScript: true,
      },
      {
        id: "linkedin-insight-tag",
        fields: { partnerId: "123456" },
        headContains: ["snap.licdn.com/li.lms-analytics/insight.min.js"],
        bodyStartContains: ["px.ads.linkedin.com/collect/?pid=123456&fmt=gif"],
        cspScriptSrc: ["https://snap.licdn.com"],
        cspImgSrc: ["https://px.ads.linkedin.com"],
        usesInlineScript: true,
      },
      {
        id: "meta-pixel",
        fields: { pixelId: "1234567890" },
        headContains: ["connect.facebook.net/en_US/fbevents.js", "1234567890"],
        bodyStartContains: ["www.facebook.com/tr?id=1234567890"],
        cspScriptSrc: ["https://connect.facebook.net"],
        cspImgSrc: ["https://www.facebook.com"],
        usesInlineScript: true,
      },
      {
        id: "google-analytics",
        fields: { measurementId: "G-ABC123" },
        headContains: [
          "googletagmanager.com/gtag/js?id=G-ABC123",
          "gtag('config','G-ABC123')",
        ],
        cspScriptSrc: ["https://www.googletagmanager.com"],
        cspConnectSrc: ["https://*.google-analytics.com"],
        usesInlineScript: true,
      },
      {
        id: "google-tag-manager",
        fields: { containerId: "GTM-ABC123" },
        headContains: ["googletagmanager.com/gtm.js?id=", "GTM-ABC123"],
        bodyStartContains: ["googletagmanager.com/ns.html?id=GTM-ABC123"],
        cspScriptSrc: ["https://www.googletagmanager.com"],
        cspFrameSrc: ["https://www.googletagmanager.com"],
        usesInlineScript: true,
      },
    ];

    for (const testCase of cases) {
      const analytics = buildAnalytics([testCase.id], {
        [testCase.id]: testCase.fields,
      });

      const compiled = compileAnalyticsScripts(analytics);

      expect(compiled.warnings).toEqual([]);
      for (const token of testCase.headContains) {
        expect(compiled.headHTML).toContain(token);
      }

      if (testCase.bodyStartContains) {
        for (const token of testCase.bodyStartContains) {
          expect(compiled.bodyStartHTML).toContain(token);
        }
      }

      for (const origin of testCase.cspScriptSrc ?? []) {
        expect(compiled.csp.scriptSrc).toContain(origin);
      }

      for (const origin of testCase.cspConnectSrc ?? []) {
        expect(compiled.csp.connectSrc).toContain(origin);
      }

      for (const origin of testCase.cspImgSrc ?? []) {
        expect(compiled.csp.imgSrc).toContain(origin);
      }

      for (const origin of testCase.cspFrameSrc ?? []) {
        expect(compiled.csp.frameSrc).toContain(origin);
      }

      expect(compiled.csp.usesInlineScript).toBe(
        testCase.usesInlineScript ?? false,
      );
    }
  });

  it("skips invalid provider config and reports warnings", () => {
    const analytics = buildAnalytics(
      ["plausible", "google-analytics"],
      {
        plausible: { domain: "not a valid domain" },
        "google-analytics": { measurementId: "G-VALID123" },
      },
    );

    const compiled = compileAnalyticsScripts(analytics);

    expect(
      compiled.warnings.some((warning) => warning.includes("Plausible")),
    ).toBe(true);
    expect(compiled.headHTML).not.toContain('data-domain="not a valid domain"');
    expect(compiled.headHTML).toContain("G-VALID123");
  });

  it("preserves deterministic output order for multiple active providers", () => {
    const analytics = buildAnalytics(
      ["simple-analytics", "google-analytics", "google-tag-manager"],
      {
        "simple-analytics": {},
        "google-analytics": { measurementId: "G-ORDER123" },
        "google-tag-manager": { containerId: "GTM-ORDER123" },
      },
    );

    const compiled = compileAnalyticsScripts(analytics);

    expect(compiled.warnings).toEqual([]);

    const simpleIndex = compiled.headHTML.indexOf(
      "scripts.simpleanalyticscdn.com/latest.js",
    );
    const gaIndex = compiled.headHTML.indexOf(
      "googletagmanager.com/gtag/js?id=G-ORDER123",
    );
    const gtmIndex = compiled.headHTML.indexOf("GTM-ORDER123");

    expect(simpleIndex).toBeGreaterThanOrEqual(0);
    expect(gaIndex).toBeGreaterThan(simpleIndex);
    expect(gtmIndex).toBeGreaterThan(gaIndex);

    expect(compiled.bodyStartHTML).toContain(
      "googletagmanager.com/ns.html?id=GTM-ORDER123",
    );
    expect(compiled.bodyEndHTML).toBe("");
    expect(compiled.csp.scriptSrc).toEqual([
      "https://scripts.simpleanalyticscdn.com",
      "https://www.googletagmanager.com",
    ]);
    expect(compiled.csp.connectSrc).toEqual(["https://*.google-analytics.com"]);
    expect(compiled.csp.frameSrc).toEqual(["https://www.googletagmanager.com"]);
    expect(compiled.csp.usesInlineScript).toBe(true);
  });
});
