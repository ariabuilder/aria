import { z } from "zod";

export const CmsUrlPatternSpecificitySchema = z
  .object({
    segmentCount: z.int().nonnegative(),
    staticSegmentCount: z.int().nonnegative(),
    staticPrefixSegmentCount: z.int().nonnegative(),
    literalLength: z.int().nonnegative(),
  })
  .strict();

export type CmsUrlPatternSpecificity = z.infer<
  typeof CmsUrlPatternSpecificitySchema
>;

export const CmsUrlPatternValidationSchema = z
  .object({
    valid: z.boolean(),
    message: z.string().optional(),
  })
  .strict();

export type CmsUrlPatternValidation = z.infer<
  typeof CmsUrlPatternValidationSchema
>;

export function normalizeCmsRoutePath(pathname: string): string {
  const withoutQuery = pathname.split("?")[0]?.split("#")[0] ?? "";
  if (!withoutQuery || withoutQuery === "/") {
    return "/";
  }
  return `/${withoutQuery.replace(/^\/+|\/+$/g, "")}`;
}

export function cmsUrlPatternParts(pattern: string): readonly string[] {
  return normalizeCmsRoutePath(pattern).split("/").filter(Boolean);
}

export function validateCmsUrlPattern(
  pattern: string | null | undefined,
): CmsUrlPatternValidation {
  const normalizedPattern = normalizeCmsRoutePath(pattern ?? "");
  if (normalizedPattern === "/") {
    return CmsUrlPatternValidationSchema.parse({
      valid: false,
      message: "URL pattern must start with a path like /posts/{slug}.",
    });
  }

  const parts = cmsUrlPatternParts(normalizedPattern);
  const unsupportedToken = parts.find(
    (part) => part.startsWith("{") && part.endsWith("}") && part !== "{slug}",
  );
  if (unsupportedToken) {
    return CmsUrlPatternValidationSchema.parse({
      valid: false,
      message: `${unsupportedToken} is not supported yet. Use {slug}.`,
    });
  }

  const slugCount = parts.filter((part) => part === "{slug}").length;
  if (slugCount !== 1) {
    return CmsUrlPatternValidationSchema.parse({
      valid: false,
      message: "URL pattern must include exactly one {slug}.",
    });
  }

  return CmsUrlPatternValidationSchema.parse({ valid: true });
}

export function matchCmsUrlPattern(
  pattern: string,
  pathname: string,
): string | null {
  const validation = validateCmsUrlPattern(pattern);
  if (!validation.valid) {
    return null;
  }

  const patternParts = cmsUrlPatternParts(pattern);
  const pathParts = cmsUrlPatternParts(pathname);
  const slugIndex = patternParts.indexOf("{slug}");
  if (slugIndex === -1 || patternParts.length !== pathParts.length) {
    return null;
  }

  for (let index = 0; index < patternParts.length; index += 1) {
    if (index === slugIndex) {
      continue;
    }
    if (patternParts[index] !== pathParts[index]) {
      return null;
    }
  }

  return decodeURIComponent(pathParts[slugIndex] ?? "").trim() || null;
}

export function cmsUrlPatternSpecificity(
  pattern: string,
): CmsUrlPatternSpecificity | null {
  const validation = validateCmsUrlPattern(pattern);
  if (!validation.valid) {
    return null;
  }

  const patternParts = cmsUrlPatternParts(pattern);
  const staticParts = patternParts.filter((part) => part !== "{slug}");
  const staticPrefixSegmentCount = patternParts.findIndex(
    (part) => part === "{slug}",
  );

  return CmsUrlPatternSpecificitySchema.parse({
    segmentCount: patternParts.length,
    staticSegmentCount: staticParts.length,
    staticPrefixSegmentCount,
    literalLength: staticParts.join("/").length,
  });
}

export function compareCmsUrlPatternSpecificity(
  left: CmsUrlPatternSpecificity,
  right: CmsUrlPatternSpecificity,
): number {
  return (
    right.segmentCount - left.segmentCount ||
    right.staticSegmentCount - left.staticSegmentCount ||
    right.staticPrefixSegmentCount - left.staticPrefixSegmentCount ||
    right.literalLength - left.literalLength
  );
}

export const SuggestCollectionUrlPatternInputSchema = z
  .object({
    collectionName: z
      .string()
      .trim()
      .min(1)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  })
  .strict();

export type SuggestCollectionUrlPatternInput = z.infer<
  typeof SuggestCollectionUrlPatternInputSchema
>;

export function suggestCollectionUrlPattern(
  input: SuggestCollectionUrlPatternInput,
): string {
  const { collectionName } = SuggestCollectionUrlPatternInputSchema.parse(input);
  return `/${collectionName}/{slug}`;
}
