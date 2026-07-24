import { actions } from "astro:actions"
import { z } from "zod"

import { log } from "@/lib/utils/logger"
import type { JsonObject } from "@/lib/types/nodes"
import { JsonObjectSchema } from "@/lib/schemas/json"
import { useHistory } from "@/features/History"
import type { OperationType } from "@/features/History"
import { unwrapStudioCrudActionResult } from "./studioCrudActionResults"

const StudioCollectionSchema = z.enum(["pages", "layouts", "components"])
const StudioSlugSchema = z.string().trim().min(1)
const StudioDescriptionSchema = z.string().trim().min(1)
const StudioHistoryOperationTypeSchema = z.enum([
  "create-page",
  "duplicate-page",
  "delete-page",
  "delete-pages-batch",
  "rename-page",
  "restore-page-version",
  "create-layout",
  "duplicate-layout",
  "delete-layout",
  "rename-layout",
  "update-layout-metadata",
  "create-component",
  "duplicate-component",
  "delete-component",
  "delete-components-batch",
  "rename-component",
])

const StudioItemOperationSchema = z
  .object({
    type: StudioHistoryOperationTypeSchema,
    description: StudioDescriptionSchema,
    collection: StudioCollectionSchema,
    slug: StudioSlugSchema,
    data: JsonObjectSchema,
  })
  .strict()

const StudioDeleteOperationSchema = z
  .object({
    type: StudioHistoryOperationTypeSchema,
    description: StudioDescriptionSchema,
    collection: StudioCollectionSchema,
    slug: StudioSlugSchema,
    restoreData: JsonObjectSchema,
  })
  .strict()

const StudioHistoryMetadataSchema = z
  .object({
    type: StudioHistoryOperationTypeSchema,
    description: StudioDescriptionSchema,
  })
  .strict()

type StudioCollection = z.infer<typeof StudioCollectionSchema>

interface StudioHistoryCallbacks {
  redo: () => Promise<void>
  undo: () => Promise<void>
}

interface StudioCreateOrUpdateItemInput {
  type: z.infer<typeof StudioHistoryOperationTypeSchema>
  description: string
  collection: StudioCollection
  slug: string
  data: JsonObject
  refresh: () => Promise<void>
  afterRedo?: () => Promise<void> | void
  afterUndo?: () => Promise<void> | void
}

interface StudioDeleteItemInput {
  type: z.infer<typeof StudioHistoryOperationTypeSchema>
  description: string
  collection: StudioCollection
  slug: string
  restoreData: JsonObject
  refresh: () => Promise<void>
}

export interface StudioBatchDeleteItem {
  slug: string
  restoreData: JsonObject
}

export interface BatchDeleteResult {
  succeeded: number
  failed: number
  errors: string[]
}

interface StudioDeleteItemsBatchInput {
  type: "delete-pages-batch" | "delete-components-batch"
  description: string
  collection: StudioCollection
  items: StudioBatchDeleteItem[]
  refresh: () => Promise<void>
}

const StudioDeleteItemsBatchSchema = z
  .object({
    type: z.enum(["delete-pages-batch", "delete-components-batch"]),
    description: StudioDescriptionSchema,
    collection: StudioCollectionSchema,
    items: z
      .array(
        z
          .object({
            slug: StudioSlugSchema,
            restoreData: JsonObjectSchema,
          })
          .strict(),
      )
      .min(1),
  })
  .strict()

function getOperationErrorMessage(
  resultError: Error | undefined,
  type: OperationType,
): string {
  return (
    resultError?.message ??
    `Failed to execute Studio history operation: ${type}`
  )
}

export function useStudioCrudHistory() {
  const { execute } = useHistory()

  async function executeStudioOperation(
    metadata: Pick<StudioCreateOrUpdateItemInput, "type" | "description">,
    callbacks: StudioHistoryCallbacks,
  ): Promise<boolean> {
    const parsedMetadata = StudioHistoryMetadataSchema.safeParse(metadata)
    if (!parsedMetadata.success) {
      log("warn", "[Studio] Invalid history metadata", {
        issues: parsedMetadata.error.issues,
      })
      return false
    }

    const result = await execute({
      type: parsedMetadata.data.type as OperationType,
      timestamp: Date.now(),
      description: parsedMetadata.data.description,
      redo: callbacks.redo,
      undo: callbacks.undo,
    })

    if (!result.success) {
      log("warn", "[Studio] History operation failed", {
        type: parsedMetadata.data.type,
        description: parsedMetadata.data.description,
        error: getOperationErrorMessage(result.error, parsedMetadata.data.type),
      })
      return false
    }

    return true
  }

  async function recordCreateItem(
    input: StudioCreateOrUpdateItemInput,
  ): Promise<string | null> {
    const parsedInput = StudioItemOperationSchema.safeParse({
      type: input.type,
      description: input.description,
      collection: input.collection,
      slug: input.slug,
      data: input.data,
    })
    if (!parsedInput.success) {
      log("warn", "[Studio] Invalid create-item history input", {
        issues: parsedInput.error.issues,
      })
      return null
    }

    let createdSlug: string | null = null
    const { collection, slug, data, refresh, type, description } = input

    const succeeded = await executeStudioOperation(
      { type, description },
      {
        redo: async () => {
          const createResult = unwrapStudioCrudActionResult(
            "create",
            await actions.createItem({
              collection,
              slug,
              data,
            }),
            {
              collection,
              slug,
              source: "useStudioCrudHistory.recordCreateItem.redo",
            },
          )

          if (!createResult.success) {
            throw new Error(createResult.error)
          }

          createdSlug = createResult.slug ?? slug ?? null
          await refresh()
        },
        undo: async () => {
          if (!createdSlug) {
            return
          }

          const deleteResult = unwrapStudioCrudActionResult(
            "delete",
            await actions.deleteItem({
              collection,
              slug: createdSlug,
            }),
            {
              collection,
              slug: createdSlug,
              source: "useStudioCrudHistory.recordCreateItem.undo",
            },
          )

          if (!deleteResult.success) {
            throw new Error(deleteResult.error)
          }

          await refresh()
        },
      },
    )

    return succeeded ? createdSlug : null
  }

  async function recordDeleteItem(
    input: StudioDeleteItemInput,
  ): Promise<boolean> {
    const parsedInput = StudioDeleteOperationSchema.safeParse({
      type: input.type,
      description: input.description,
      collection: input.collection,
      slug: input.slug,
      restoreData: input.restoreData,
    })
    if (!parsedInput.success) {
      log("warn", "[Studio] Invalid delete-item history input", {
        issues: parsedInput.error.issues,
      })
      return false
    }

    let deleted = false
    const { collection, slug, restoreData, refresh, type, description } = input

    const succeeded = await executeStudioOperation(
      { type, description },
      {
        redo: async () => {
          const deleteResult = unwrapStudioCrudActionResult(
            "delete",
            await actions.deleteItem({
              collection,
              slug,
            }),
            {
              collection,
              slug,
              source: "useStudioCrudHistory.recordDeleteItem.redo",
            },
          )

          if (!deleteResult.success) {
            throw new Error(deleteResult.error)
          }

          deleted = true
          await refresh()
        },
        undo: async () => {
          const createResult = unwrapStudioCrudActionResult(
            "create",
            await actions.createItem({
              collection,
              slug,
              data: restoreData,
            }),
            {
              collection,
              slug,
              source: "useStudioCrudHistory.recordDeleteItem.undo",
            },
          )

          if (!createResult.success) {
            throw new Error(createResult.error)
          }

          await refresh()
        },
      },
    )

    return succeeded ? deleted : false
  }

  async function recordDeleteItemsBatch(
    input: StudioDeleteItemsBatchInput,
  ): Promise<BatchDeleteResult> {
    const parsedInput = StudioDeleteItemsBatchSchema.safeParse({
      type: input.type,
      description: input.description,
      collection: input.collection,
      items: input.items,
    })
    if (!parsedInput.success) {
      log("warn", "[Studio] Invalid delete-items-batch history input", {
        issues: parsedInput.error.issues,
      })
      return {
        succeeded: 0,
        failed: input.items.length,
        errors: ["Invalid batch delete input"],
      }
    }

    const { collection, items, type, description } = parsedInput.data
    const { refresh } = input
    const deletedSlugs: string[] = []
    const errors: string[] = []
    const restoreBySlug = new Map(
      items.map((item) => [item.slug, item.restoreData]),
    )

    const historyRecorded = await executeStudioOperation(
      { type, description },
      {
        redo: async () => {
          for (const item of items) {
            const deleteResult = unwrapStudioCrudActionResult(
              "delete",
              await actions.deleteItem({
                collection,
                slug: item.slug,
              }),
              {
                collection,
                slug: item.slug,
                source: "useStudioCrudHistory.recordDeleteItemsBatch.redo",
              },
            )

            if (!deleteResult.success) {
              errors.push(
                `${item.slug}: ${deleteResult.error ?? "Delete failed"}`,
              )
              continue
            }

            deletedSlugs.push(item.slug)
          }

          await refresh()

          if (deletedSlugs.length === 0) {
            throw new Error(
              errors[0] ?? "Failed to delete selected items",
            )
          }
        },
        undo: async () => {
          for (const slug of [...deletedSlugs].reverse()) {
            const restoreData = restoreBySlug.get(slug)
            if (!restoreData) {
              continue
            }

            const createResult = unwrapStudioCrudActionResult(
              "create",
              await actions.createItem({
                collection,
                slug,
                data: restoreData,
              }),
              {
                collection,
                slug,
                source: "useStudioCrudHistory.recordDeleteItemsBatch.undo",
              },
            )

            if (!createResult.success) {
              throw new Error(createResult.error)
            }
          }

          await refresh()
        },
      },
    )

    if (!historyRecorded) {
      return {
        succeeded: 0,
        failed: items.length,
        errors: errors.length > 0 ? errors : ["Batch delete failed"],
      }
    }

    return {
      succeeded: deletedSlugs.length,
      failed: items.length - deletedSlugs.length,
      errors,
    }
  }

  async function recordUpdateItem(
    input: StudioCreateOrUpdateItemInput & { restoreData: JsonObject },
  ): Promise<boolean> {
    const parsedUpdate = StudioItemOperationSchema.safeParse({
      type: input.type,
      description: input.description,
      collection: input.collection,
      slug: input.slug,
      data: input.data,
    })
    const parsedRestoreData = JsonObjectSchema.safeParse(input.restoreData)
    if (!parsedUpdate.success || !parsedRestoreData.success) {
      log("warn", "[Studio] Invalid update-item history input", {
        issues: [
          ...(parsedUpdate.success ? [] : parsedUpdate.error.issues),
          ...(parsedRestoreData.success ? [] : parsedRestoreData.error.issues),
        ],
      })
      return false
    }

    const {
      collection,
      slug,
      data,
      restoreData,
      refresh,
      type,
      description,
      afterRedo,
      afterUndo,
    } = input

    return (
      (await executeStudioOperation(
        { type, description },
        {
          redo: async () => {
            const updateResult = unwrapStudioCrudActionResult(
              "update",
              await actions.updateItem({
                collection,
                slug,
                data,
              }),
              {
                collection,
                slug,
                source: "useStudioCrudHistory.recordUpdateItem.redo",
              },
            )

            if (!updateResult.success) {
              throw new Error(updateResult.error)
            }

            await refresh()
            await afterRedo?.()
          },
          undo: async () => {
            const updateResult = unwrapStudioCrudActionResult(
              "update",
              await actions.updateItem({
                collection,
                slug,
                data: restoreData,
              }),
              {
                collection,
                slug,
                source: "useStudioCrudHistory.recordUpdateItem.undo",
              },
            )

            if (!updateResult.success) {
              throw new Error(updateResult.error)
            }

            await refresh()
            await afterUndo?.()
          },
        },
      )) 
    )
  }

  return {
    executeStudioOperation,
    recordCreateItem,
    recordDeleteItem,
    recordDeleteItemsBatch,
    recordUpdateItem,
  }
}
