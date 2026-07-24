import { log } from "@/lib/utils/logger"
import { z } from "zod"

import { BuilderNodeSchema } from "@/lib/schemas/nodes"
import { PageMetaDataSchema, type PageMetaData } from "./_seo-types"

export const SeoDataSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    ogImage: z.string().optional(),
    canonical: z.string().optional(),
    noIndex: z.boolean().optional(),
    noFollow: z.boolean().optional(),
  })
  .strict()

export type SeoData = z.infer<typeof SeoDataSchema>

const PageMetaActionErrorSchema = z
  .looseObject({
    message: z.string().optional(),
  })
  
export const PageMetaActionSuccessSchema = z.object({
  success: z.literal(true),
  data: PageMetaDataSchema,
})

export const PageMetaActionFailureSchema = z.object({
  success: z.literal(false),
  error: PageMetaActionErrorSchema.optional(),
})

export const PageMetaActionResultSchema = z.union([
  PageMetaActionSuccessSchema,
  PageMetaActionFailureSchema,
])

type PageMetaActionEnvelope =
  | {
      data?: unknown
      error?: { message?: string | undefined } | null
    }
  | null
  | undefined

export const ComposeActionResultSchema = z
  .looseObject({
    pageBlocks: z.array(BuilderNodeSchema).optional(),
  })
  
export const UpdateSeoActionResultSchema = z
  .looseObject({
    success: z.boolean().optional(),
    data: z
      .looseObject({
        slug: z.string().optional(),
        seo: z.record(z.string(), z.unknown()).optional(),
      }).optional(),
    error: z
      .looseObject({
        message: z.string().optional(),
      }).optional(),
  })
  
export const SeoUpdatePayloadSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    ogImage: z.string().optional(),
    canonical: z.string().optional(),
    noindex: z.boolean().optional(),
    nofollow: z.boolean().optional(),
  })
  .strict()

export type SeoUpdatePayload = z.infer<typeof SeoUpdatePayloadSchema>

export function unwrapPageMetaActionResult(
  result: PageMetaActionEnvelope,
  fallbackMessage: string,
  context: Record<string, unknown> = {},
): { success: true; data: PageMetaData } | { success: false; error: string } {
  if (result?.error?.message) {
    return {
      success: false,
      error: result.error.message,
    }
  }

  const parsedResult = PageMetaActionResultSchema.safeParse(result?.data)

  if (!parsedResult.success) {
    log("warn", "[Studio/PageMeta] Invalid page meta action response", {
      ...context,
      issues: parsedResult.error.issues,
    })
    return {
      success: false,
      error: fallbackMessage,
    }
  }

  if (!parsedResult.data.success) {
    return {
      success: false,
      error: parsedResult.data.error?.message || fallbackMessage,
    }
  }

  return {
    success: true,
    data: parsedResult.data.data,
  }
}

export function cloneSeoData(data: SeoData): SeoData {
  return {
    title: data.title,
    description: data.description,
    keywords: data.keywords ? [...data.keywords] : [],
    ogImage: data.ogImage,
    canonical: data.canonical,
    noIndex: Boolean(data.noIndex),
    noFollow: Boolean(data.noFollow),
  }
}

export function normalizeSeoData(input: PageMetaData | undefined): SeoData {
  const seo = input?.seo
  if (!seo) {
    return {}
  }

  return {
    title:
      typeof seo.title === "string" && seo.title.trim() ? seo.title : undefined,
    description:
      typeof seo.description === "string" && seo.description.trim()
        ? seo.description
        : undefined,
    keywords: Array.isArray(seo.keywords)
      ? seo.keywords.filter((item): item is string => typeof item === "string")
      : [],
    ogImage:
      typeof seo.ogImage === "string" && seo.ogImage.trim()
        ? seo.ogImage
        : undefined,
    canonical:
      typeof seo.canonical === "string" && seo.canonical.trim()
        ? seo.canonical
        : undefined,
    noIndex: Boolean(seo.noIndex),
    noFollow: Boolean(seo.noFollow),
  }
}

export function toSeoUpdatePayload(data: SeoData): SeoUpdatePayload {
  const payload = {
    title: data.title || undefined,
    description: data.description || undefined,
    keywords: data.keywords?.length ? [...data.keywords] : undefined,
    ogImage: data.ogImage || undefined,
    canonical: data.canonical || undefined,
    noindex: data.noIndex,
    nofollow: data.noFollow,
  }

  return SeoUpdatePayloadSchema.parse(payload)
}
