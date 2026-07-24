import {
  DISCOVERY_LLMS_CUSTOM_MAX_BYTES,
  DISCOVERY_ROBOTS_CUSTOM_MAX_BYTES,
  DISCOVERY_SITEMAP_CUSTOM_MAX_BYTES,
  type DiscoverySettings,
} from "./schemas";
import { normalizeBaseUrl } from "./normalizeBaseUrl";

export interface CustomArtifactValidationError {
  field: keyof DiscoverySettings | "general";
  message: string;
}

const NULL_BYTE = /\0/u;
const ENTITY = /<!ENTITY/i;
const DOCTYPE = /<!DOCTYPE/i;
const UNSAFE_PROTOCOL = /(?:^|[\s"'(<])(?:javascript|data):/i;
const PROTOCOL_RELATIVE = /(?:^|[\s"'(<])\/\//;

function hasNullByte(value: string): boolean {
  return NULL_BYTE.test(value);
}

function hasUnsafeMarkup(value: string): boolean {
  return ENTITY.test(value) || DOCTYPE.test(value);
}

function collectUnsafeProtocols(value: string): boolean {
  return UNSAFE_PROTOCOL.test(value) || PROTOCOL_RELATIVE.test(value);
}

function sameOriginUrl(candidate: string, siteUrl: string): boolean {
  try {
    const base = normalizeBaseUrl(siteUrl);
    if (!base) {
      return false;
    }
    const resolved = new URL(candidate, base);
    const site = new URL(base);
    return resolved.origin === site.origin;
  } catch {
    return false;
  }
}

export function validateRobotsCustom(
  body: string,
  context: { siteUrl?: string; discourageSearchEngines?: boolean },
): CustomArtifactValidationError[] {
  const errors: CustomArtifactValidationError[] = [];
  const trimmed = body.trim();

  if (trimmed.length === 0) {
    return errors;
  }

  if (trimmed.length > DISCOVERY_ROBOTS_CUSTOM_MAX_BYTES) {
    errors.push({
      field: "robotsCustom",
      message: "Custom robots.txt exceeds the maximum size.",
    });
  }

  if (hasNullByte(trimmed)) {
    errors.push({
      field: "robotsCustom",
      message: "Custom robots.txt cannot contain null bytes.",
    });
  }

  if (collectUnsafeProtocols(trimmed)) {
    errors.push({
      field: "robotsCustom",
      message: "Custom robots.txt contains unsafe protocol links.",
    });
  }

  const sitemapLines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^sitemap:/i.test(line));

  if (context.siteUrl) {
    for (const line of sitemapLines) {
      const url = line.replace(/^sitemap:\s*/i, "").trim();
      if (url && !sameOriginUrl(url, context.siteUrl)) {
        errors.push({
          field: "robotsCustom",
          message: "Custom robots.txt Sitemap URLs must match the site URL origin.",
        });
        break;
      }
    }
  }

  if (
    context.discourageSearchEngines &&
    /\ballow:\s*\/?\s*$/im.test(trimmed)
  ) {
    errors.push({
      field: "robotsCustom",
      message:
        "Custom Allow rules conflict with site-wide discourage search engines.",
    });
  }

  return errors;
}

export function validateSitemapCustom(
  body: string,
  context: { siteUrl: string },
): CustomArtifactValidationError[] {
  const errors: CustomArtifactValidationError[] = [];
  const trimmed = body.trim();

  if (trimmed.length === 0) {
    return errors;
  }

  if (trimmed.length > DISCOVERY_SITEMAP_CUSTOM_MAX_BYTES) {
    errors.push({
      field: "sitemapCustom",
      message: "Custom sitemap exceeds the maximum size.",
    });
  }

  if (hasNullByte(trimmed) || hasUnsafeMarkup(trimmed)) {
    errors.push({
      field: "sitemapCustom",
      message: "Custom sitemap contains unsafe content.",
    });
  }

  if (collectUnsafeProtocols(trimmed)) {
    errors.push({
      field: "sitemapCustom",
      message: "Custom sitemap contains unsafe protocol links.",
    });
  }

  const rootMatch = trimmed.match(/<(\w+)[\s>]/);
  const root = rootMatch?.[1]?.toLowerCase();
  if (root !== "urlset" && root !== "sitemapindex") {
    errors.push({
      field: "sitemapCustom",
      message: "Custom sitemap must be a urlset or sitemapindex document.",
    });
  }

  const locMatches = trimmed.matchAll(/<loc>([^<]+)<\/loc>/gi);
  for (const match of locMatches) {
    const loc = match[1]?.trim();
    if (!loc) {
      continue;
    }
    if (!sameOriginUrl(loc, context.siteUrl)) {
      errors.push({
        field: "sitemapCustom",
        message: "Custom sitemap loc URLs must match the site URL origin.",
      });
      break;
    }
  }

  return errors;
}

export function validateLlmsCustom(body: string): CustomArtifactValidationError[] {
  const errors: CustomArtifactValidationError[] = [];
  const trimmed = body.trim();

  if (trimmed.length === 0) {
    return errors;
  }

  if (trimmed.length > DISCOVERY_LLMS_CUSTOM_MAX_BYTES) {
    errors.push({
      field: "llmsCustom",
      message: "Custom llms.txt exceeds the maximum size.",
    });
  }

  if (hasNullByte(trimmed)) {
    errors.push({
      field: "llmsCustom",
      message: "Custom llms.txt cannot contain null bytes.",
    });
  }

  if (collectUnsafeProtocols(trimmed)) {
    errors.push({
      field: "llmsCustom",
      message: "Custom llms.txt contains unsafe protocol links.",
    });
  }

  return errors;
}

export function validateDiscoverySettings(
  settings: DiscoverySettings,
  context: { siteUrl?: string },
): CustomArtifactValidationError[] {
  const errors: CustomArtifactValidationError[] = [];

  if (settings.robotsMode === "custom" && typeof settings.robotsCustom === "string") {
    errors.push(
      ...validateRobotsCustom(settings.robotsCustom, {
        siteUrl: context.siteUrl,
        discourageSearchEngines: settings.discourageSearchEngines,
      }),
    );
  }

  if (
    settings.sitemapMode === "custom" &&
    typeof settings.sitemapCustom === "string" &&
    context.siteUrl
  ) {
    errors.push(
      ...validateSitemapCustom(settings.sitemapCustom, {
        siteUrl: context.siteUrl,
      }),
    );
  }

  if (settings.llmsMode === "custom" && typeof settings.llmsCustom === "string") {
    errors.push(...validateLlmsCustom(settings.llmsCustom));
  }

  return errors;
}
