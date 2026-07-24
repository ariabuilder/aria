import { z } from "zod";
import { normalizeDirectCmsMediaReference } from "./directMediaReference";

export const STYLE_BINDING_BACKGROUND_IMAGE = "styles.backgroundImage";

export const STYLE_BINDING_KEYS = new Set<string>([
  STYLE_BINDING_BACKGROUND_IMAGE,
]);

const CmsImageFieldValueSchema = z
  .object({
    mediaId: z.string().trim().min(1),
    alt: z.string().optional(),
    caption: z.string().optional(),
    url: z.string().optional(),
  })
  .strict();

export function isStyleBindingKey(key: string): boolean {
  return STYLE_BINDING_KEYS.has(key.trim());
}

export function parseStyleBindingStyleKey(key: string): string | null {
  if (!key.startsWith("styles.")) {
    return null;
  }
  return key.slice("styles.".length);
}

export function buildBackgroundImageCssValue(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return "";
  }
  if (/^(url\(|linear-gradient\(|radial-gradient\()/i.test(trimmed)) {
    return trimmed;
  }
  const match = trimmed.match(/^url\((['"]?)(.*)\1\)$/i);
  if (match) {
    return trimmed;
  }
  return `url("${trimmed.replace(/"/g, '\\"')}")`;
}

export function extractUrlFromBackgroundImageCss(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^url\((['"]?)(.*)\1\)$/i);
  return match ? match[2] : trimmed;
}

export function parseCmsImageFieldValue(value: unknown): z.infer<
  typeof CmsImageFieldValueSchema
> | null {
  const parsed = CmsImageFieldValueSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function resolveCmsImageFieldUrl(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return (
      normalizeDirectCmsMediaReference(value) ?? value.trim()
    );
  }
  const parsed = parseCmsImageFieldValue(value);
  if (!parsed) {
    return undefined;
  }
  if (parsed.url?.trim()) {
    return (
      normalizeDirectCmsMediaReference(parsed.url) ?? parsed.url.trim()
    );
  }
  if (parsed.mediaId?.trim()) {
    return normalizeDirectCmsMediaReference(parsed.mediaId);
  }
  return undefined;
}

export function coerceCmsBindingValueForStyleTarget(
  bindingKey: string,
  value: unknown,
): unknown {
  if (bindingKey !== STYLE_BINDING_BACKGROUND_IMAGE) {
    return value;
  }

  const directUrl = resolveCmsImageFieldUrl(value);
  if (directUrl) {
    return buildBackgroundImageCssValue(directUrl);
  }

  if (parseCmsImageFieldValue(value)) {
    return value;
  }

  return value;
}

export function isUnresolvedCmsImageStyleValue(value: unknown): boolean {
  return parseCmsImageFieldValue(value) !== null;
}
