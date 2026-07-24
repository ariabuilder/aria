/**
 * Generic Create, Read, Update, Delete operations for pages,
 * layouts, and components. These are collection-agnostic operations.
 */

import { ActionError, defineAction, type ActionAPIContext } from "astro:actions";
import { z } from "astro/zod";
import type {
  PageDSL,
  LayoutDSL,
  ComponentDSL,
} from "../lib/types/nodes";
import {
  validatePageDSL,
  validateLayoutDSL,
  validateComponentDSL,
} from "../lib/schemas/nodes";
import type { ContentMutationKind } from "../lib/storage/adapter";
import {
  deleteResource,
  getResource,
  getAdapter,
  requireOperation,
  resolveAuthorizedMutation,
  saveResource,
  type CollectionType,
} from "./_shared";
import { assertPageLayoutChangeAllowed } from "../lib/pages/layoutPolicy.server";
import { normalizePageLayoutRef } from "../lib/pages/layoutPolicy";
import { savePageSnapshot } from "../lib/rendering/pageSnapshots";
import { log as baseLog } from "../lib/utils/logger";

type LogLevel = "debug" | "info" | "warn" | "error";

interface StructuredCrudError {
  code: string;
  message: string;
  context?: Record<string, unknown>;
}

function collectionMutationKind(
  collection: CollectionType,
): ContentMutationKind {
  switch (collection) {
    case "pages":
      return "save-page";
    case "layouts":
      return "save-layout";
    case "components":
      return "save-component";
  }
}

function validateResourceForSave(
  collection: CollectionType,
  slug: string,
  data: unknown,
): PageDSL | LayoutDSL | ComponentDSL {
  switch (collection) {
    case "pages": {
      const validated = validatePageDSL(data);
      if (!validated.success) {
        throw createError(ERROR_CODES.INVALID_INPUT, "Invalid page DSL", {
          slug,
          collection,
          details: validated.error.issues,
        });
      }
      return validated.data as PageDSL;
    }
    case "layouts": {
      const validated = validateLayoutDSL(data);
      if (!validated.success) {
        throw createError(ERROR_CODES.INVALID_INPUT, "Invalid layout DSL", {
          slug,
          collection,
          details: validated.error.issues,
        });
      }
      return validated.data as LayoutDSL;
    }
    case "components": {
      const validated = validateComponentDSL(data);
      if (!validated.success) {
        throw createError(ERROR_CODES.INVALID_INPUT, "Invalid component DSL", {
          slug,
          collection,
          details: validated.error.issues,
        });
      }
      return validated.data as ComponentDSL;
    }
  }
}

const ERROR_CODES = {
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
  RESOURCE_EXISTS: "RESOURCE_EXISTS",
  RESOURCE_IN_USE: "RESOURCE_IN_USE",
  INVALID_INPUT: "INVALID_INPUT",
  STORAGE_ERROR: "STORAGE_ERROR",
} as const;

function mapCrudCodeToActionErrorCode(
  code: string,
): "BAD_REQUEST" | "NOT_FOUND" | "INTERNAL_SERVER_ERROR" {
  switch (code) {
    case ERROR_CODES.RESOURCE_NOT_FOUND:
      return "NOT_FOUND";
    case ERROR_CODES.INVALID_INPUT:
    case ERROR_CODES.RESOURCE_EXISTS:
    case ERROR_CODES.RESOURCE_IN_USE:
      return "BAD_REQUEST";
    case ERROR_CODES.STORAGE_ERROR:
      return "INTERNAL_SERVER_ERROR";
    default:
      return "INTERNAL_SERVER_ERROR";
  }
}

const HOME_PAGE_SLUG = "index";

const JsonObjectInputSchema = z
  .unknown()
  .refine(
    (value): value is Record<string, unknown> =>
      typeof value === "object" && value !== null && !Array.isArray(value),
    "Expected an object payload",
  );

function log(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): void {
  const prefix = `[Aria CRUD][${level.toUpperCase()}]`;

  baseLog(level, `${prefix} ${message}`, context);
}

const performanceMetrics = new Map<string, { startTime: number }>();

function startPerformanceTracking(operation: string): void {
  performanceMetrics.set(operation, { startTime: performance.now() });
}

function endPerformanceTracking(operation: string): number {
  const metrics = performanceMetrics.get(operation);
  if (!metrics) return 0;

  const duration = Math.round(performance.now() - metrics.startTime);
  performanceMetrics.delete(operation);
  return duration;
}

function createError(
  code: string,
  message: string,
  context?: Record<string, unknown>,
): StructuredCrudError {
  return { code, message, context };
}

function isStructuredCrudError(error: unknown): error is StructuredCrudError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string"
  );
}

function handleError(error: unknown, operation: string): never {
  if (error instanceof ActionError) {
    log("error", `${operation} failed`, {
      code: error.code,
      error: error.message,
    });
    throw error;
  }

  if (error instanceof Error) {
    log("error", `${operation} failed`, { error: error.message });
    throw error;
  }

  if (isStructuredCrudError(error)) {
    log("error", `${operation} failed`, {
      code: error.code,
      error: error.message,
      context: error.context,
    });
    throw new ActionError({
      code: mapCrudCodeToActionErrorCode(error.code),
      message: error.message,
    });
  }

  const genericError = new Error(`${operation} failed: ${String(error)}`);
  log("error", genericError.message);
  throw genericError;
}

function sanitizeInput(input: string): string {
  return input
    .replace(/[<>'"&]/g, "")
    .replace(/\.\./g, "")
    .trim();
}

function validateResourceId(
  collection: CollectionType,
  value: string,
): boolean {
  if (value.length === 0 || value.length > 255) {
    return false;
  }

  if (collection === "components") {
    const componentIdRegex = /^[a-zA-Z0-9._-]+$/;
    return componentIdRegex.test(value);
  }

  const slugRegex = /^[a-zA-Z0-9_-]+$/;
  return slugRegex.test(value);
}

const CollectionSchema = z.enum(["pages", "layouts", "components"]);
const SlugSchema = z.string().min(1).max(255);

const GetItemInputSchema = z.object({
  collection: CollectionSchema,
  slug: SlugSchema,
});

const CreateItemInputSchema = z.object({
  collection: CollectionSchema,
  slug: SlugSchema,
  data: JsonObjectInputSchema,
});

const UpdateItemInputSchema = z.object({
  collection: CollectionSchema,
  slug: SlugSchema,
  data: JsonObjectInputSchema,
  expectedVersion: z.string().trim().min(1).optional(),
});

const DeleteItemInputSchema = z.object({
  collection: CollectionSchema,
  slug: SlugSchema,
});

const DuplicateItemInputSchema = z.object({
  collection: CollectionSchema,
  sourceSlug: SlugSchema,
  newSlug: SlugSchema,
});

export async function handleGetItem(
  input: z.infer<typeof GetItemInputSchema>,
  context: ActionAPIContext,
): Promise<unknown> {
  const { collection, slug } = input;
  await requireOperation(context, "crud.getItem");

  const operation = `getItem:${collection}:${slug}`;
  startPerformanceTracking(operation);

  try {
    const sanitizedSlug = sanitizeInput(slug);
    if (!validateResourceId(collection, sanitizedSlug)) {
      throw createError(
        ERROR_CODES.INVALID_INPUT,
        `Invalid slug format: ${slug}`,
      );
    }

    const adapter = await getAdapter(context);
    const result = await getResource(adapter, collection, sanitizedSlug);

    endPerformanceTracking(operation);
    return result;
  } catch (error) {
    endPerformanceTracking(operation);
    return handleError(error, operation);
  }
}

export async function handleCreateItem(
  input: z.infer<typeof CreateItemInputSchema>,
  context: ActionAPIContext,
): Promise<{ success: boolean; slug: string }> {
  const { collection, slug, data } = input;
  const { authorship } = await resolveAuthorizedMutation(
    context,
    "crud.createItem",
    collectionMutationKind(collection),
  );

  const operation = `createItem:${collection}:${slug}`;
  startPerformanceTracking(operation);

  try {
    const sanitizedSlug = sanitizeInput(slug);
    if (!validateResourceId(collection, sanitizedSlug)) {
      throw createError(
        ERROR_CODES.INVALID_INPUT,
        `Invalid slug format: ${slug}`,
      );
    }

    const adapter = await getAdapter(context);

    // Check if item already exists
    let exists = false;
    try {
      await getResource(adapter, collection, sanitizedSlug);
      exists = true;
    } catch {
      // Resource doesn't exist, which is what we want
    }

    if (exists) {
      throw createError(
        ERROR_CODES.RESOURCE_EXISTS,
        `${collection.slice(0, -1)} already exists: ${sanitizedSlug}`,
      );
    }

    const validated = validateResourceForSave(collection, sanitizedSlug, data);
    await saveResource(
      adapter,
      context,
      collection,
      sanitizedSlug,
      validated,
      authorship,
    );

    const duration = endPerformanceTracking(operation);
    log("info", `Created ${collection.slice(0, -1)}: ${sanitizedSlug}`, {
      duration: `${duration}ms`,
    });

    return { success: true, slug: sanitizedSlug };
  } catch (error) {
    endPerformanceTracking(operation);
    return handleError(error, operation);
  }
}

export async function handleUpdateItem(
  input: z.infer<typeof UpdateItemInputSchema>,
  context: ActionAPIContext,
): Promise<{ success: boolean; slug: string; version: string }> {
  const { collection, slug, data, expectedVersion } = input;
  const { authorship } = await resolveAuthorizedMutation(
    context,
    "crud.updateItem",
    collectionMutationKind(collection),
  );

  const operation = `updateItem:${collection}:${slug}`;
  startPerformanceTracking(operation);

  try {
    const sanitizedSlug = sanitizeInput(slug);
    if (!validateResourceId(collection, sanitizedSlug)) {
      throw createError(
        ERROR_CODES.INVALID_INPUT,
        `Invalid slug format: ${slug}`,
      );
    }

    const adapter = await getAdapter(context);

    const existing = await getResource(adapter, collection, sanitizedSlug);
    const currentVersion = (existing as { version?: unknown }).version;
    if (expectedVersion && currentVersion !== expectedVersion) {
      throw createError(
        "VERSION_CONFLICT",
        "This draft is out of date. Reload it before saving.",
        {
          expectedVersion,
          currentVersion: typeof currentVersion === "string" ? currentVersion : null,
        },
      );
    }

    const validated = validateResourceForSave(collection, sanitizedSlug, data);

    if (collection === "pages") {
      const existingPage = existing as PageDSL;
      const validatedPage = validated as PageDSL;
      const layoutChanged =
        normalizePageLayoutRef(existingPage.layout) !==
        normalizePageLayoutRef(validatedPage.layout);

      await assertPageLayoutChangeAllowed(
        context,
        existingPage.layout,
        validatedPage.layout,
      );

      const version = await saveResource(
        adapter,
        context,
        collection,
        sanitizedSlug,
        validated,
        authorship,
        { versionSaveOptions: { expectedVersion } },
      );

      if (layoutChanged) {
        await savePageSnapshot(
          { page: validatedPage, stage: "draft" },
          adapter,
          { locals: context.locals },
        );
        if (validatedPage.status === "published") {
          await savePageSnapshot(
            { page: validatedPage, stage: "published" },
            adapter,
            { locals: context.locals },
          );
        }
      }

      const duration = endPerformanceTracking(operation);
      log("info", `Updated ${collection.slice(0, -1)}: ${sanitizedSlug}`, {
        duration: `${duration}ms`,
      });
      return { success: true, slug: sanitizedSlug, version };
    } else {
      const version = await saveResource(
        adapter,
        context,
        collection,
        sanitizedSlug,
        validated,
        authorship,
        { versionSaveOptions: { expectedVersion } },
      );

      const duration = endPerformanceTracking(operation);
      log("info", `Updated ${collection.slice(0, -1)}: ${sanitizedSlug}`, {
        duration: `${duration}ms`,
      });
      return { success: true, slug: sanitizedSlug, version };
    }
  } catch (error) {
    endPerformanceTracking(operation);
    return handleError(error, operation);
  }
}

export async function handleDeleteItem(
  input: z.infer<typeof DeleteItemInputSchema>,
  context: ActionAPIContext,
): Promise<{ success: boolean }> {
  const { collection, slug } = input;
  await requireOperation(context, "crud.deleteItem");

  const operation = `deleteItem:${collection}:${slug}`;
  startPerformanceTracking(operation);

  try {
    const sanitizedSlug = sanitizeInput(slug);
    if (!validateResourceId(collection, sanitizedSlug)) {
      throw createError(
        ERROR_CODES.INVALID_INPUT,
        `Invalid slug format: ${slug}`,
      );
    }

    if (collection === "pages" && sanitizedSlug === HOME_PAGE_SLUG) {
      throw createError(
        ERROR_CODES.INVALID_INPUT,
        `Cannot delete reserved home page: ${HOME_PAGE_SLUG}`,
      );
    }

    const adapter = await getAdapter(context);

    // Verify item exists before attempting deletion
    await getResource(adapter, collection, sanitizedSlug);

    await deleteResource(adapter, context, collection, sanitizedSlug);

    const duration = endPerformanceTracking(operation);
    log("info", `Deleted ${collection.slice(0, -1)}: ${sanitizedSlug}`, {
      duration: `${duration}ms`,
    });

    return { success: true };
  } catch (error) {
    endPerformanceTracking(operation);
    return handleError(error, operation);
  }
}

export async function handleDuplicateItem(
  input: z.infer<typeof DuplicateItemInputSchema>,
  context: ActionAPIContext,
): Promise<{ success: boolean; slug: string }> {
  const { collection, sourceSlug, newSlug } = input;
  const { authorship } = await resolveAuthorizedMutation(
    context,
    "crud.duplicateItem",
    collectionMutationKind(collection),
  );

  const operation = `duplicateItem:${collection}:${sourceSlug}->${newSlug}`;
  startPerformanceTracking(operation);

  try {
    const sanitizedSource = sanitizeInput(sourceSlug);
    const sanitizedNew = sanitizeInput(newSlug);

    if (
      !validateResourceId(collection, sanitizedSource) ||
      !validateResourceId(collection, sanitizedNew)
    ) {
      throw createError(ERROR_CODES.INVALID_INPUT, "Invalid slug format");
    }

    const adapter = await getAdapter(context);

    const sourceData = await getResource<PageDSL | LayoutDSL | ComponentDSL>(
      adapter,
      collection,
      sanitizedSource,
    );

    const duplicatedData = {
      ...sourceData,
      id: sanitizedNew,
      slug: sanitizedNew,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const validated = validateResourceForSave(
      collection,
      sanitizedNew,
      duplicatedData,
    );
    await saveResource(
      adapter,
      context,
      collection,
      sanitizedNew,
      validated,
      authorship,
    );

    const duration = endPerformanceTracking(operation);
    log(
      "info",
      `Duplicated ${collection.slice(0, -1)}: ${sanitizedSource} -> ${sanitizedNew}`,
      { duration: `${duration}ms` },
    );

    return { success: true, slug: sanitizedNew };
  } catch (error) {
    endPerformanceTracking(operation);
    return handleError(error, operation);
  }
}

export const crud = {
  /**
   * Get single item by slug
   *
   * Retrieves a page, layout, or component with full data including nodes.
   */
  getItem: defineAction({
    accept: "json",
    input: GetItemInputSchema,
    handler: handleGetItem,
  }),

  /**
   * Create new item
   *
   * Creates a new page, layout, or component with provided data.
   */
  createItem: defineAction({
    accept: "json",
    input: CreateItemInputSchema,
    handler: handleCreateItem,
  }),

  /**
   * Update existing item
   *
   * Updates an existing page, layout, or component.
   * Use this for metadata updates; use savePage/saveLayout/saveComponent
   * for bulk node updates.
   */
  updateItem: defineAction({
    accept: "json",
    input: UpdateItemInputSchema,
    handler: handleUpdateItem,
  }),

  /**
   * Delete item
   *
   * Deletes a page, layout, or component.
   * For components, validates that no pages/layouts reference it.
   */
  deleteItem: defineAction({
    accept: "json",
    input: DeleteItemInputSchema,
    handler: handleDeleteItem,
  }),

  /**
   * Duplicate item
   *
   * Creates a copy of an existing page, layout, or component
   * with a new slug.
   */
  duplicateItem: defineAction({
    accept: "json",
    input: DuplicateItemInputSchema,
    handler: handleDuplicateItem,
  }),
};
