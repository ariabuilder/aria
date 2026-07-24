import { describe, expect, it } from "vitest";
import { getArtifactUnavailableReason } from "../../admin/features/Studio/settings/lib/discoveryArtifactUnavailable";

describe("getArtifactUnavailableReason", () => {
  it("returns null when preview has content", () => {
    expect(
      getArtifactUnavailableReason({
        kind: "sitemap",
        mode: "auto",
        preview: "<urlset></urlset>",
        discourageSearchEngines: true,
        hasSiteUrl: true,
      }),
    ).toBeNull();
  });

  it("explains sitemap suppression when search engines are discouraged", () => {
    const reason = getArtifactUnavailableReason({
      kind: "sitemap",
      mode: "auto",
      preview: "",
      discourageSearchEngines: true,
      hasSiteUrl: true,
    });

    expect(reason).toContain("Discourage search engines");
    expect(reason).toContain("Customize");
  });

  it("explains llms suppression when search engines are discouraged", () => {
    const reason = getArtifactUnavailableReason({
      kind: "llms",
      mode: "auto",
      preview: "",
      discourageSearchEngines: true,
      hasSiteUrl: true,
    });

    expect(reason).toContain("Discourage search engines");
  });

  it("does not suppress robots when search engines are discouraged", () => {
    expect(
      getArtifactUnavailableReason({
        kind: "robots",
        mode: "auto",
        preview: "",
        discourageSearchEngines: true,
        hasSiteUrl: true,
      }),
    ).toBeNull();
  });

  it("asks for a site URL when sitemap cannot be generated", () => {
    const reason = getArtifactUnavailableReason({
      kind: "sitemap",
      mode: "auto",
      preview: "",
      discourageSearchEngines: false,
      hasSiteUrl: false,
    });

    expect(reason).toContain("site URL");
  });
});
