import { z } from "zod";

export const CanonicalTypographyTypeSchema = z.enum(["heading", "text"]);

export type CanonicalTypographyType = z.infer<
  typeof CanonicalTypographyTypeSchema
>;

const TYPOGRAPHY_TYPE_ALIASES: Record<string, CanonicalTypographyType> = {
  Heading: "heading",
  heading: "heading",
  Text: "text",
  text: "text",
  Paragraph: "text",
  paragraph: "text",
};

export function normalizeTypographyNodeType(
  type: string,
): CanonicalTypographyType | null {
  const trimmed = type.trim();
  if (!trimmed) {
    return null;
  }

  const direct = TYPOGRAPHY_TYPE_ALIASES[trimmed];
  if (direct) {
    return direct;
  }

  const lower = trimmed.toLowerCase();
  return TYPOGRAPHY_TYPE_ALIASES[lower] ?? null;
}

export function getTypographyTypeKey(type: string): CanonicalTypographyType | null {
  return normalizeTypographyNodeType(type);
}

export function isTypographyNodeType(type: string): boolean {
  return normalizeTypographyNodeType(type) !== null;
}
