/**
 * Cover Image Schemas
 *
 * Zod schemas for validating cover image mutations on pages.
 */

import { z } from "astro/zod";

/**
 * Input schema for updating a page's cover image
 */
export const UpdateCoverImageInputSchema = z.object({
  pageSlug: z.string().min(1, "Page slug is required"),
  expectedVersion: z.string().trim().min(1).optional(),
  src: z.string().min(1, "Image source path is required"),
  alt: z.string().optional().default(""),
  caption: z.string().optional().default(""),
  autoSetOgImage: z.boolean().optional().default(true),
});

export type UpdateCoverImageInput = z.infer<typeof UpdateCoverImageInputSchema>;

export const UpdateCoverImageOutputSchema = z.object({
  success: z.boolean(),
  version: z.string().trim().min(1),
  featuredImage: z
    .object({
      src: z.string(),
      alt: z.string().optional(),
      caption: z.string().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
    })
    .optional(),
  ogImageUpdated: z.boolean().optional(),
  error: z.string().optional(),
  code: z.string().optional(),
});

export type UpdateCoverImageOutput = z.infer<typeof UpdateCoverImageOutputSchema>;

/**
 * Input schema for removing a page's cover image
 */
export const RemoveCoverImageInputSchema = z.object({
  pageSlug: z.string().min(1, "Page slug is required"),
  expectedVersion: z.string().trim().min(1).optional(),
  clearOgImage: z.boolean().optional().default(true),
});

export type RemoveCoverImageInput = z.infer<typeof RemoveCoverImageInputSchema>;

/**
 * Output schema for cover image removal response
 */
export const RemoveCoverImageOutputSchema = z.object({
  success: z.boolean(),
  version: z.string().trim().min(1),
  error: z.string().optional(),
  code: z.string().optional(),
});

export type RemoveCoverImageOutput = z.infer<typeof RemoveCoverImageOutputSchema>;
