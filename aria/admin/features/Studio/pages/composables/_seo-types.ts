import { z } from "zod"

export const SeoMetaSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  ogImage: z.string().optional(),
  noIndex: z.boolean().optional(),
  noFollow: z.boolean().optional(),
  canonical: z.string().optional(),
})

export type SeoMeta = z.infer<typeof SeoMetaSchema>

export const PageStatusSchema = z.enum(["published", "draft", "archived"])

export const PageLayoutInfoSchema = z.object({
  slug: z.string().nullable(),
  name: z.string().nullable(),
  hasHeader: z.boolean(),
  hasFooter: z.boolean(),
})

export const FrontmatterFieldSchema = z.object({
  key: z.string(),
  value: z.unknown(),
  type: z.enum(["string", "number", "boolean", "array", "object", "date"]),
})

export const PageMetaDataSchema = z.object({
  slug: z.string(),
  title: z.string(),
  path: z.string(),
  status: PageStatusSchema,
  layout: PageLayoutInfoSchema,
  seo: SeoMetaSchema,
  frontmatter: z.array(FrontmatterFieldSchema),
  updatedAt: z.string().optional(),
  createdAt: z.string().optional(),
  wordCount: z.number().optional(),
  blockCount: z.number().optional(),
})

export type PageMetaData = z.infer<typeof PageMetaDataSchema>
