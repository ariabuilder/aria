import { actions } from "astro:actions"
import { z } from "zod"

import { log } from "@/lib/utils/logger"
import { useHistory } from "@/features/History"
import type { OperationType } from "@/features/History"
import {
  SeoDataSchema,
  UpdateSeoActionResultSchema,
  cloneSeoData,
  toSeoUpdatePayload,
  type SeoData,
} from "./seoSchemas"

const SeoSlugSchema = z.string().trim().min(1)
const SeoHistoryMetadataSchema = z
  .object({
    type: z.literal("update-page-dsl"),
    description: z.string().trim().min(1),
  })
  .strict()
const SeoHistoryInputSchema = z
  .object({
    slug: SeoSlugSchema,
    previousSeo: SeoDataSchema,
    nextSeo: SeoDataSchema,
  })
  .strict()

type SeoHistoryResult = {
  success: boolean
  error?: string
}

interface SeoHistoryCallbacks {
  redo: () => Promise<void>
  undo: () => Promise<void>
}

interface RecordSeoUpdateInput {
  slug: string
  previousSeo: SeoData
  nextSeo: SeoData
  applySeo: (seo: SeoData) => Promise<void> | void
}

function getHistoryErrorMessage(resultError: Error | undefined): string {
  return resultError?.message ?? "Failed to execute SEO history operation"
}

export function useSeoHistory() {
  const { execute } = useHistory()

  async function persistSeo(slug: string, seo: SeoData): Promise<void> {
    const result = await actions.pages.updateSeo({
      slug,
      seo: toSeoUpdatePayload(seo),
    })

    const parsedResult = UpdateSeoActionResultSchema.safeParse(result?.data)
    if (!parsedResult.success) {
      log("warn", "[Studio/SEO] Invalid updateSeo response", {
        slug,
        issues: parsedResult.error.issues,
      })
      throw new Error("Failed to save SEO settings")
    }

    if (!parsedResult.data.success) {
      throw new Error(
        parsedResult.data.error?.message ?? "Failed to save SEO settings",
      )
    }
  }

  async function executeSeoHistoryOperation(
    description: string,
    callbacks: SeoHistoryCallbacks,
  ): Promise<SeoHistoryResult> {
    const parsedMetadata = SeoHistoryMetadataSchema.safeParse({
      type: "update-page-dsl",
      description,
    })
    if (!parsedMetadata.success) {
      return {
        success: false,
        error:
          parsedMetadata.error.issues[0]?.message ??
          "Invalid SEO history metadata",
      }
    }

    const result = await execute({
      type: parsedMetadata.data.type as OperationType,
      timestamp: Date.now(),
      description: parsedMetadata.data.description,
      redo: callbacks.redo,
      undo: callbacks.undo,
    })

    if (!result.success) {
      return {
        success: false,
        error: getHistoryErrorMessage(result.error),
      }
    }

    return { success: true }
  }

  async function recordSeoUpdate(
    input: RecordSeoUpdateInput,
  ): Promise<SeoHistoryResult> {
    const parsedInput = SeoHistoryInputSchema.safeParse({
      slug: input.slug,
      previousSeo: input.previousSeo,
      nextSeo: input.nextSeo,
    })
    if (!parsedInput.success) {
      log("warn", "[Studio/SEO] Invalid SEO history input", {
        issues: parsedInput.error.issues,
      })
      return {
        success: false,
        error:
          parsedInput.error.issues[0]?.message ?? "Invalid SEO history input",
      }
    }

    const { slug, previousSeo, nextSeo } = parsedInput.data

    return executeSeoHistoryOperation(`Update SEO for page "${slug}"`, {
      redo: async () => {
        await persistSeo(slug, nextSeo)
        await input.applySeo(cloneSeoData(nextSeo))
      },
      undo: async () => {
        await persistSeo(slug, previousSeo)
        await input.applySeo(cloneSeoData(previousSeo))
      },
    })
  }

  return {
    recordSeoUpdate,
  }
}
