import { describe, expect, it } from "vitest";
import { resolveDashboardSiteTitle } from "@/features/Studio/dashboard/schemas/dashboard";

describe("resolveDashboardSiteTitle", () => {
  it("returns Aria Builder when site name is empty and settings are ready", () => {
    expect(
      resolveDashboardSiteTitle({
        siteName: "",
        isReady: true,
      }),
    ).toBe("Aria Builder");
  });

  it("returns site name when set and settings are ready", () => {
    expect(
      resolveDashboardSiteTitle({
        siteName: "My Studio",
        isReady: true,
        ssrSiteName: "Aria Builder",
      }),
    ).toBe("My Studio");
  });

  it("uses SSR value while settings are loading", () => {
    expect(
      resolveDashboardSiteTitle({
        siteName: "",
        isReady: false,
        ssrSiteName: "My Studio",
      }),
    ).toBe("My Studio");
  });

  it("updates to site name after settings load without page reload", () => {
    expect(
      resolveDashboardSiteTitle({
        siteName: "Fresh Name",
        isReady: true,
        ssrSiteName: "Aria Builder",
      }),
    ).toBe("Fresh Name");
  });

  it("returns Aria Builder when site name is cleared after settings load", () => {
    expect(
      resolveDashboardSiteTitle({
        siteName: "   ",
        isReady: true,
        ssrSiteName: "Stale SSR Name",
      }),
    ).toBe("Aria Builder");
  });
});
