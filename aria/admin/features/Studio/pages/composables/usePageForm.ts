import { z } from "zod"

export const PageStatusSchema = z.enum(["draft", "published", "scheduled", "archived"])
export type PageStatus = z.infer<typeof PageStatusSchema>

export const PageAccessModeSchema = z.enum(["public", "password", "private", "unlisted"])
export type PageAccessMode = z.infer<typeof PageAccessModeSchema>

export const PageFormSchema = z.object({
  title: z.string().min(1, "Title is required").max(255),
  slug: z.string().min(1, "Slug is required").max(255).regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and hyphens"),
  layout: z.string().min(1, "Layout is required"),
  status: PageStatusSchema,
  parent: z.string().nullable(),
  metaTitle: z.string().max(255, "Meta title must be under 255 characters").optional(),
  metaDescription: z.string().max(500, "Meta description must be under 500 characters").optional(),
  keywords: z.array(z.string()).optional(),
  ogImage: z.string().optional(),
  canonical: z.string().optional(),
  noindex: z.boolean().optional(),
  nofollow: z.boolean().optional(),
})

export type PageFormValues = z.infer<typeof PageFormSchema>

export function validatePageForm(data: unknown): { success: true; data: PageFormValues } | { success: false; errors: Record<string, string> } {
  const result = PageFormSchema.safeParse(data)
  if (result.success) return { success: true, data: result.data }

  const errors: Record<string, string> = {}
  for (const issue of result.error.issues) {
    const path = issue.path.join(".")
    if (!errors[path]) errors[path] = issue.message
  }
  return { success: false, errors }
}
