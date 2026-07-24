export type DiscoveryArtifactKind = "robots" | "sitemap" | "llms";

export interface ArtifactUnavailableContext {
  kind: DiscoveryArtifactKind;
  mode: "auto" | "custom" | "off";
  preview: string;
  discourageSearchEngines: boolean;
  hasSiteUrl: boolean;
  t?: StudioI18n["t"];
}

export function getArtifactUnavailableReason(
  context: ArtifactUnavailableContext,
): string | null {
  if (context.mode === "off" || context.preview.trim().length > 0) {
    return null;
  }

  if (context.discourageSearchEngines && context.kind !== "robots") {
    return context.t?.("settings.discovery.artifactUnavailable.discouraged") ?? 'Not published while "Discourage search engines" is enabled. Turn that off above, or click Customize to write your own override.';
  }

  if (!context.hasSiteUrl && context.kind === "sitemap") {
    return context.t?.("settings.discovery.artifactUnavailable.sitemapNeedsUrl") ?? "Add a site URL in General settings to generate a sitemap.";
  }

  if (context.kind === "sitemap") {
    return context.t?.("settings.discovery.artifactUnavailable.noIndexablePages") ?? "No indexable pages are available for the sitemap yet.";
  }

  if (context.kind === "llms") {
    return context.hasSiteUrl
      ? (context.t?.("settings.discovery.artifactUnavailable.noLlmsContent") ?? "No llms.txt content is available yet.")
      : (context.t?.("settings.discovery.artifactUnavailable.llmsNeedsUrl") ?? "Add a site URL in General settings to generate llms.txt links.");
  }

  return null;
}
import type { StudioI18n } from "@/i18n";
