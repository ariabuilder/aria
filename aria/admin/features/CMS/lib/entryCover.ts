import { z } from "zod";
import { normalizeCmsFieldKey } from "../../../../lib/cms/systemFields";

const CmsEntryCoverRecordSchema = z
  .object({
    mediaId: z.string().trim().optional(),
    id: z.string().trim().optional(),
    url: z.string().trim().optional(),
    alt: z.string().trim().optional(),
  })
  .strip();

const CmsEntryFrontmatterSchema = z.record(z.string(), z.unknown());

const COVER_KEYS = new Set([
  "cover",
  "cover_image",
  "cover_photo",
  "hero",
  "hero_image",
  "hero_photo",
  "featured_image",
  "featured_photo",
  "featuredimage",
  "media_image",
  "media_photo",
  "thumbnail",
]);

export interface CmsEntryCover {
  mediaId: string | null;
  url: string | null;
  alt: string;
}

function normalizeCoverValue(value: unknown): CmsEntryCover | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    return {
      mediaId: /^(https?:\/\/|\/|blob:|data:image\/)/i.test(trimmed)
        ? null
        : trimmed,
      url: /^(https?:\/\/|\/|blob:|data:image\/)/i.test(trimmed)
        ? trimmed
        : null,
      alt: "",
    };
  }

  const parsed = CmsEntryCoverRecordSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }

  const mediaId = parsed.data.mediaId || parsed.data.id || "";
  const url = parsed.data.url || "";
  if (!mediaId && !url) {
    return null;
  }

  return {
    mediaId: mediaId || null,
    url: url || null,
    alt: parsed.data.alt ?? "",
  };
}

export function extractCmsEntryCover(
  frontmatter: Record<string, unknown>,
): CmsEntryCover | null {
  const parsed = CmsEntryFrontmatterSchema.parse(frontmatter);
  for (const [key, value] of Object.entries(parsed)) {
    if (!COVER_KEYS.has(normalizeCmsFieldKey(key))) {
      continue;
    }
    const cover = normalizeCoverValue(value);
    if (cover) {
      return cover;
    }
  }
  return null;
}
