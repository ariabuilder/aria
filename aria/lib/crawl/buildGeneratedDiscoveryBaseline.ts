import type { SiteSettings } from "../storage/adapter";
import { buildLlmsTxt } from "./buildLlmsTxt";
import { buildRobotsTxt } from "./buildRobotsTxt";
import { buildSitemapXml } from "./buildSitemapXml";
import {
  mergeDiscoverySettings,
  type DiscoverySettings,
  type PageForDiscovery,
} from "./schemas";

export type DiscoveryGeneratedArtifact = "robots" | "sitemap" | "llms";

function buildBaselineDiscoverySettings(
  current: DiscoverySettings | undefined,
  artifact: DiscoveryGeneratedArtifact,
  options?: { forEditorSeed?: boolean },
): DiscoverySettings {
  return mergeDiscoverySettings(current, {
    ...(artifact === "robots" ? { robotsMode: "auto" as const } : {}),
    ...(artifact === "sitemap" ? { sitemapMode: "auto" as const } : {}),
    ...(artifact === "llms" ? { llmsMode: "auto" as const } : {}),
    robotsCustom: undefined,
    sitemapCustom: undefined,
    llmsCustom: undefined,
    ...(options?.forEditorSeed && artifact !== "robots"
      ? { discourageSearchEngines: false }
      : {}),
  });
}

export function buildGeneratedDiscoveryBaseline(input: {
  artifact: DiscoveryGeneratedArtifact;
  siteSettings: SiteSettings | null | undefined;
  pages: readonly PageForDiscovery[];
  /** When true, produce template content for the editor even if live output is suppressed. */
  forEditorSeed?: boolean;
}): string | null {
  const discovery = buildBaselineDiscoverySettings(
    input.siteSettings?.discovery,
    input.artifact,
    { forEditorSeed: input.forEditorSeed },
  );
  const siteSettings: SiteSettings = {
    ...(input.siteSettings ?? {}),
    discovery,
  };

  switch (input.artifact) {
    case "robots":
      return buildRobotsTxt({ siteSettings });
    case "sitemap":
      return buildSitemapXml({ siteSettings, pages: input.pages });
    case "llms":
      return buildLlmsTxt({ siteSettings, pages: input.pages });
  }
}
