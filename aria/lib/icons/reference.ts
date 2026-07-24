import { z } from "zod";

export const IconPackKeySchema = z.enum(["lucide", "coreui-brands"]);

export type IconPackKey = z.infer<typeof IconPackKeySchema>;

const IconNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9-]+$/, "Invalid icon name format");

export const CanonicalIconIdSchema = z
  .string()
  .trim()
  .regex(
    /^(lucide|coreui-brands):[a-z0-9-]+$/,
    "Invalid canonical icon id",
  );

export const IconReferenceSchema = z.object({
  id: CanonicalIconIdSchema,
  pack: IconPackKeySchema,
  name: IconNameSchema,
  source: z.string().trim().min(1),
  version: z.string().trim().min(1),
});

export const IconPropInputSchema = z.union([
  z.string().trim().max(200),
  IconReferenceSchema,
]);

export type IconReference = z.infer<typeof IconReferenceSchema>;
export type IconPropInput = z.infer<typeof IconPropInputSchema>;

export function toCanonicalIconId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = trimmed.startsWith("i-") ? trimmed.slice(2) : trimmed;
  const parsed = CanonicalIconIdSchema.safeParse(normalized);
  return parsed.success ? parsed.data : null;
}

export function parseCanonicalIconId(id: string): {
  id: string;
  pack: IconPackKey;
  name: string;
} | null {
  const canonical = CanonicalIconIdSchema.safeParse(id);
  if (!canonical.success) return null;

  const [pack, ...nameParts] = canonical.data.split(":");
  const parsedPack = IconPackKeySchema.safeParse(pack);
  if (!parsedPack.success) return null;

  return {
    id: canonical.data,
    pack: parsedPack.data,
    name: nameParts.join(":"),
  };
}

export function getIconClassFromValue(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  const parsedRef = IconReferenceSchema.safeParse(value);
  if (parsedRef.success) {
    return `i-${parsedRef.data.id}`;
  }

  return "";
}

export function getCanonicalIconIdFromValue(value: unknown): string | null {
  const parsedRef = IconReferenceSchema.safeParse(value);
  if (parsedRef.success) {
    return parsedRef.data.id;
  }

  return toCanonicalIconId(value);
}

export function normalizeIconValue(value: IconPropInput): IconPropInput {
  const parsedObject = IconReferenceSchema.safeParse(value);
  if (parsedObject.success) {
    return parsedObject.data;
  }

  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const canonicalId = toCanonicalIconId(trimmed);
  if (!canonicalId) {
    return trimmed;
  }

  const parsed = parseCanonicalIconId(canonicalId);
  if (!parsed) {
    return trimmed;
  }

  return {
    id: parsed.id,
    pack: parsed.pack,
    name: parsed.name,
    source: "iconify",
    version: "2026-02-25-snapshot",
  };
}
