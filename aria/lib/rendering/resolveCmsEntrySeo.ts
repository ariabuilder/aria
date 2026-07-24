import { z } from "zod";

const CmsEntrySeoFrontmatterSchema = z
  .object({
    seoTitle: z.string().trim().min(1).optional(),
    seo_title: z.string().trim().min(1).optional(),
    seoDescription: z.string().trim().min(1).optional(),
    seo_description: z.string().trim().min(1).optional(),
    ogImage: z.string().trim().min(1).optional(),
    og_image: z.string().trim().min(1).optional(),
  })
  .catchall(z.unknown());

export const CmsEntrySeoOverrideSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
    ogImage: z.string().trim().min(1).optional(),
  })
  .strict();
export type CmsEntrySeoOverride = z.infer<typeof CmsEntrySeoOverrideSchema>;

function pickFirstNonEmpty(
  ...values: ReadonlyArray<string | undefined>
): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return undefined;
}

export function resolveCmsEntrySeoOverride(input: {
  entryTitle: string;
  frontmatter: Record<string, unknown>;
}): CmsEntrySeoOverride {
  const parsedFrontmatter = CmsEntrySeoFrontmatterSchema.parse(
    input.frontmatter,
  );

  return CmsEntrySeoOverrideSchema.parse({
    title: pickFirstNonEmpty(
      parsedFrontmatter.seoTitle,
      parsedFrontmatter.seo_title,
      input.entryTitle.trim() || undefined,
    ),
    description: pickFirstNonEmpty(
      parsedFrontmatter.seoDescription,
      parsedFrontmatter.seo_description,
    ),
    ogImage: pickFirstNonEmpty(
      parsedFrontmatter.ogImage,
      parsedFrontmatter.og_image,
    ),
  });
}
