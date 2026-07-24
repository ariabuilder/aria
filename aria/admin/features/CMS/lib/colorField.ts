import { z } from "zod";
import type { FieldSchema } from "../../../../lib/cms/schemas";

const LegacyColorFieldTypeSchema = z.enum(["string", "text", "slug"]);

const COLOR_WORD_PATTERN = /(^|[\s_-])(bg|background|accent|border|color|colour|fill|foreground|highlight|stroke)([\s_-]|$)/i;
const COLOR_SUFFIX_PATTERN = /(color|colour)$/i;

function normalizeFieldText(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/\s+/g, " ");
}

export function isLegacyCmsColorField(field: FieldSchema): boolean {
  if (!LegacyColorFieldTypeSchema.safeParse(field.type).success) {
    return false;
  }

  const keyText = normalizeFieldText(field.key);
  const labelText = normalizeFieldText(field.label);
  const combined = `${keyText} ${labelText}`.trim();

  return (
    COLOR_SUFFIX_PATTERN.test(field.key) ||
    COLOR_SUFFIX_PATTERN.test(field.label) ||
    COLOR_WORD_PATTERN.test(combined)
  );
}

export function isCmsColorField(field: FieldSchema): boolean {
  return field.type === "color" || isLegacyCmsColorField(field);
}
