import type { SiteSettings } from "../storage/adapter";
import { buildLlmsTxt } from "./buildLlmsTxt";
import { buildRobotsTxt } from "./buildRobotsTxt";
import { buildSitemapXml } from "./buildSitemapXml";
import {
  DiscoveryArtifactsSchema,
  type DiscoveryArtifacts,
  type PageForDiscovery,
  type LocalizedPageForDiscovery,
} from "./schemas";

export function buildDiscoveryArtifacts(input: {
  siteSettings: SiteSettings | null | undefined;
  pages: readonly PageForDiscovery[];
  cmsEntries?: readonly import("./schemas").DiscoverableCmsEntry[];
  localizedPages?: readonly LocalizedPageForDiscovery[];
}): DiscoveryArtifacts {
  const generatedAt = new Date().toISOString();
  return DiscoveryArtifactsSchema.parse({
    robots: buildRobotsTxt({ siteSettings: input.siteSettings }),
    sitemap: buildSitemapXml({
      siteSettings: input.siteSettings,
      pages: input.pages,
      cmsEntries: input.cmsEntries,
      localizedPages: input.localizedPages,
    }),
    llms: buildLlmsTxt({
      siteSettings: input.siteSettings,
      pages: input.pages,
    }),
    generatedAt,
  });
}
