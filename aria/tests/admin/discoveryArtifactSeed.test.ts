import { describe, expect, it } from "vitest";
import { resolveArtifactCustomSeed } from "../../admin/features/Studio/settings/lib/discoveryArtifactSeed";

describe("resolveArtifactCustomSeed", () => {
  it("keeps existing custom content when present", () => {
    expect(
      resolveArtifactCustomSeed("User-agent: *\nDisallow: /secret", "Allow: /"),
    ).toBe("User-agent: *\nDisallow: /secret");
  });

  it("seeds from generated baseline when custom is empty", () => {
    expect(resolveArtifactCustomSeed("", "User-agent: *\nAllow: /")).toBe(
      "User-agent: *\nAllow: /",
    );
  });

  it("returns empty string when both custom and baseline are empty", () => {
    expect(resolveArtifactCustomSeed(undefined, null)).toBe("");
  });
});
