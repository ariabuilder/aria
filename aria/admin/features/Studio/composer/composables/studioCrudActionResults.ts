import { z } from "zod"

import {
  getTransportErrorCode,
  parseActionPayload,
  unwrapActionPayload,
  type ActionTransportResult,
} from "@/lib/actions/actionResult"
import type { ComponentDSL, LayoutDSL, PageDSL } from "@/lib/types/nodes"
import {
  ComponentDSLSchema,
  LayoutDSLSchema,
  PageDSLSchema,
} from "@/lib/schemas/nodes"

const NonEmptyStringSchema = z.string().trim().min(1)

const StudioCrudActionErrorSchema = z.looseObject({
  message: NonEmptyStringSchema.optional(),
  code: z.string().trim().min(1).optional(),
})

const StudioCrudActionFailureSchema = z.looseObject({
  success: z.literal(false),
  error: StudioCrudActionErrorSchema.optional(),
})

const StudioCrudCreateOrUpdateSuccessSchema = z.looseObject({
  success: z.literal(true),
  slug: NonEmptyStringSchema,
  version: NonEmptyStringSchema.optional(),
})

const StudioCrudDeleteSuccessSchema = z.looseObject({
  success: z.literal(true),
})

const StudioCrudActionResultSchemas = {
  create: z.union([
    StudioCrudCreateOrUpdateSuccessSchema,
    StudioCrudActionFailureSchema,
  ]),
  update: z.union([
    StudioCrudCreateOrUpdateSuccessSchema,
    StudioCrudActionFailureSchema,
  ]),
  delete: z.union([
    StudioCrudDeleteSuccessSchema,
    StudioCrudActionFailureSchema,
  ]),
} as const

const StudioCrudActionFallbackMessages = {
  create: "Failed to create item",
  update: "Failed to update item",
  delete: "Failed to delete item",
} as const

const StudioCrudRawGetItemSchemaMap = {
  pages: z.looseObject({
    nodes: z.array(z.unknown()),
  }),
  layouts: z.looseObject({
    nodes: z.array(z.unknown()),
  }),
  components: z.looseObject({
    nodes: z.array(z.unknown()),
  }),
} as const

const StudioCrudGetItemSchemaMap = {
  pages: PageDSLSchema,
  layouts: LayoutDSLSchema,
  components: ComponentDSLSchema,
} as const

export type StudioCrudActionKind = keyof typeof StudioCrudActionResultSchemas
export type StudioCrudCollection = keyof typeof StudioCrudGetItemSchemaMap

type StudioCrudActionSuccess = {
  success: true
  slug?: string
  version?: string
}

type StudioCrudActionFailure = {
  success: false
  error: string
  errorCode?: string
}

type StudioCrudGetItemDataMap = {
  pages: PageDSL
  layouts: LayoutDSL
  components: ComponentDSL
}

export function unwrapStudioCrudActionResult(
  kind: StudioCrudActionKind,
  result: ActionTransportResult,
  context: Record<string, unknown> = {},
): StudioCrudActionSuccess | StudioCrudActionFailure {
  const fallbackMessage = StudioCrudActionFallbackMessages[kind]
  const transportErrorCode = getTransportErrorCode(result)

  const parsedResult = unwrapActionPayload(
    result,
    StudioCrudActionResultSchemas[kind],
    {
      fallbackMessage,
      invalidLogMessage: `[Studio] Invalid ${kind}Item action response`,
      context: {
        ...context,
        kind,
      },
    },
  )
  if (!parsedResult.success) {
    return {
      success: false,
      error: parsedResult.error,
      errorCode: transportErrorCode,
    }
  }

  const data = parsedResult.data
  const failureParsed = StudioCrudActionFailureSchema.safeParse(data)
  if (failureParsed.success) {
    return {
      success: false,
      error: failureParsed.data.error?.message ?? fallbackMessage,
      errorCode:
        failureParsed.data.error?.code ??
        (typeof failureParsed.data.code === "string"
          ? failureParsed.data.code
          : undefined),
    }
  }

  if ("slug" in data && typeof data.slug === "string") {
    return {
      success: true,
      slug: data.slug,
      version:
        "version" in data && typeof data.version === "string"
          ? data.version
          : undefined,
    }
  }

  return { success: true }
}

export function unwrapStudioCrudGetItemResult<
  TCollection extends StudioCrudCollection,
>(
  collection: TCollection,
  result: ActionTransportResult,
  fallbackMessage: string,
  context: Record<string, unknown> = {},
):
  | { success: true; data: StudioCrudGetItemDataMap[TCollection] }
  | StudioCrudActionFailure {
  const rawParsedResult = unwrapActionPayload(
    result,
    StudioCrudRawGetItemSchemaMap[collection],
    {
      fallbackMessage,
      invalidLogMessage: `[Studio] Invalid ${collection} payload from getItem`,
      context: {
        ...context,
        collection,
      },
    },
  )
  if (!rawParsedResult.success) {
    return rawParsedResult
  }

  const parsedResult = parseActionPayload(
    result?.data,
    StudioCrudGetItemSchemaMap[collection],
    {
      invalidLogMessage: `[Studio] Invalid ${collection} payload from getItem`,
      context: {
        ...context,
        collection,
      },
    },
  )
  if (!parsedResult) {
    return {
      success: false,
      error: fallbackMessage,
    }
  }

  return {
    success: true,
    data: parsedResult as StudioCrudGetItemDataMap[TCollection],
  }
}
