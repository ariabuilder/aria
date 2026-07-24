import type { SiteSettings } from "../storage/adapter";
import { normalizeBaseUrl } from "./normalizeBaseUrl";
import { DiscoverySettingsSchema, type DiscoverySettings } from "./schemas";
import { validateRobotsCustom } from "./validateCustomArtifacts";

const AI_TRAINING_BOTS = [
  "GPTBot",
  "Google-Extended",
  "CCBot",
  "anthropic-ai",
  "ClaudeBot",
] as const;

function resolveDiscoverySettings(
  siteSettings: SiteSettings | null | undefined,
): DiscoverySettings {
  return DiscoverySettingsSchema.parse(siteSettings?.discovery ?? {});
}

export function buildRobotsTxt(input: {
  siteSettings: SiteSettings | null | undefined;
}): string {
  const discovery = resolveDiscoverySettings(input.siteSettings);
  const baseUrl = normalizeBaseUrl(input.siteSettings?.siteUrl) ?? undefined;

  if (discovery.robotsMode === "custom" && discovery.robotsCustom?.trim()) {
    const custom = discovery.robotsCustom.trim();
    const validationErrors = validateRobotsCustom(custom, {
      siteUrl: baseUrl,
      discourageSearchEngines: discovery.discourageSearchEngines,
    });
    if (validationErrors.length > 0) {
      return buildAutoRobots(discovery, baseUrl ?? "");
    }
    if (
      discovery.includeSitemapInRobots !== false &&
      baseUrl &&
      discovery.sitemapMode !== "off" &&
      !custom.toLowerCase().includes("sitemap:")
    ) {
      return `${custom}\nSitemap: ${baseUrl}/sitemap.xml\n`;
    }
    return `${custom}\n`;
  }

  return buildAutoRobots(discovery, baseUrl ?? "");
}

function buildAutoRobots(
  discovery: DiscoverySettings,
  baseUrl: string,
): string {
  const lines = ["User-agent: *"];

  if (discovery.aiBotPolicy === "block-training") {
    lines.push("Content-Signal: search=yes, ai-train=no");
    for (const bot of AI_TRAINING_BOTS) {
      lines.push("", `User-agent: ${bot}`, "Disallow: /");
    }
    lines.push("", "User-agent: *");
  }

  if (discovery.discourageSearchEngines) {
    lines.push("Disallow: /");
  } else {
    lines.push("Allow: /");
  }

  if (
    discovery.includeSitemapInRobots !== false &&
    baseUrl &&
    discovery.sitemapMode !== "off"
  ) {
    lines.push(`Sitemap: ${baseUrl}/sitemap.xml`);
    lines.push(`Sitemap: ${baseUrl}/sitemap-images.xml`);
  }

  return `${lines.join("\n")}\n`;
}
