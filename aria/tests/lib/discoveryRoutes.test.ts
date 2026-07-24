import { describe, expect, it } from "vitest";
import { DiscoverySettingsSchema } from "../../lib/crawl/schemas";
import { resolveDiscoveryArtifactRevision } from "../../../src/lib/discoveryRoutes";

describe("discovery route cache revisions", () => {
  it("changes when discovery settings change under the same style revision", () => {
    const baseRevision = resolveDiscoveryArtifactRevision({
      styleRevision: "styles-1",
      updated_at: 123,
      discovery: DiscoverySettingsSchema.parse({
        discourageSearchEngines: false,
      }),
    });
    const discoveryRevision = resolveDiscoveryArtifactRevision({
      styleRevision: "styles-1",
      updated_at: 123,
      discovery: DiscoverySettingsSchema.parse({
        discourageSearchEngines: true,
      }),
    });

    expect(discoveryRevision).not.toBe(baseRevision);
  });
});
