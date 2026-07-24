/**
 * Bulk save operations for pages, layouts, and components with nonce validation
 * for security. These are specialized saves for updating entire node trees.
 */

import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import type {
  PageDSL,
  LayoutDSL,
  ComponentDSL,
  BuilderNode,
} from "../lib/types/nodes";
import {
  getResource,
  getAdapter,
  resolveAuthorizedMutation,
  saveResource,
  validateNonce,
  consumeNonce,
} from "./_shared";
import { log as baseLog } from "../lib/utils/logger";
import { normalizeNodesIcons } from "../lib/icons/action-normalizers";
import { savePageSnapshot } from "../lib/rendering/pageSnapshots";
import { assertPageLayoutChangeAllowed } from "../lib/pages/layoutPolicy.server";
import { normalizePageLayoutRef } from "../lib/pages/layoutPolicy";

type LogLevel = "debug" | "info" | "warn" | "error";

interface ActionError {
  code: string;
  message: string;
  context?: Record<string, unknown>;
}

const ERROR_CODES = {
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
  INVALID_INPUT: "INVALID_INPUT",
  INVALID_NONCE: "INVALID_NONCE",
  VERSION_CONFLICT: "VERSION_CONFLICT",
  STORAGE_ERROR: "STORAGE_ERROR",
} as const;

function log(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): void {
  const prefix = `[Aria Save][${level.toUpperCase()}]`;

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
): ActionError {
  return { code, message, context };
}

function isActionError(error: unknown): error is ActionError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string"
  );
}

function formatUnknownError(error: unknown): string {
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    try {
      return JSON.stringify(error);
    } catch {
      return Object.prototype.toString.call(error);
    }
  }
  return String(error);
}

function handleError(error: unknown, operation: string): never {
  if (error instanceof Error) {
    log("error", `${operation} failed`, { error: error.message });
    throw error;
  }

  if (isActionError(error)) {
    const structuredError = Object.assign(
      new Error(`${operation} failed: ${error.message}`),
      {
        code: error.code,
        context: error.context,
      },
    );
    log("error", `${operation} failed`, {
      code: error.code,
      error: error.message,
      context: error.context,
    });
    throw structuredError;
  }

  const formattedError = formatUnknownError(error);
  const genericError = new Error(`${operation} failed: ${formattedError}`);
  log("error", `${operation} failed`, { error: formattedError });
  throw genericError;
}

async function requireValidComposeNonce(
  context: Parameters<typeof validateNonce>[0],
  resourceId: string,
  nonce: string,
): Promise<void> {
  const validation = await validateNonce(context, resourceId, nonce);

  if (!validation.valid) {
    throw createError(
      ERROR_CODES.INVALID_NONCE,
      validation.error || "Nonce validation failed",
    );
  }
}

async function consumeComposeNonceAfterSave(
  context: Parameters<typeof consumeNonce>[0],
  resourceId: string,
  nonce: string,
): Promise<void> {
  await consumeNonce(context, resourceId, nonce);
}

function sanitizeInput(input: string): string {
  return input
    .replace(/[<>'"&]/g, "")
    .replace(/\.\./g, "")
    .trim();
}

function validateSlug(slug: string): boolean {
  const slugRegex = /^[a-zA-Z0-9_-]+$/;
  return slugRegex.test(slug) && slug.length > 0 && slug.length <= 255;
}

function assertExpectedVersion(
  resource: PageDSL | LayoutDSL | ComponentDSL,
  expectedVersion: string | undefined,
  authoritativeVersion?: string | null,
): void {
  if (!expectedVersion) return;

  const currentVersion = authoritativeVersion ?? resource.version;
  if (currentVersion !== expectedVersion) {
    throw createError(
      ERROR_CODES.VERSION_CONFLICT,
      "This draft is out of date. Reload it before saving.",
      {
        expectedVersion,
        currentVersion: currentVersion ?? null,
      },
    );
  }
}

const IdSchema = z.string().min(1).max(255);
const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);
const JsonObjectSchema = z.record(z.string(), JsonValueSchema);

const BuilderNodeSchema = z.looseObject({
  id: z.string(),
  type: z.string(),
  slot: z.string().optional(),
  props: JsonObjectSchema.optional(),
  styles: z.record(z.string(), z.unknown()).optional(),
  children: z.array(z.lazy((): z.ZodTypeAny => BuilderNodeSchema)).optional(),
  componentRef: z.string().optional(),
});

export const save = {
  /**
   * /** Save page with nonce validation Bulk save of the entire page node
   * tree. Composer supplies expectedVersion so a stale editor cannot overwrite a newer draft.
   */
  page: defineAction({
    accept: "json",
    input: z.object({
      id: IdSchema,
      blocks: z.array(BuilderNodeSchema),
      layout: z.string().optional(),
      nonce: z.string().optional(),
      expectedVersion: z.string().trim().min(1).optional(),
    }),
    handler: async (input, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "save.page",
        "save-page",
      );

      const operation = `savePage:${input.id}`;
      startPerformanceTracking(operation);

      try {
        const sanitizedId = sanitizeInput(input.id);
        if (!validateSlug(sanitizedId)) {
          throw createError(
            ERROR_CODES.INVALID_INPUT,
            `Invalid page ID format: ${input.id}`,
          );
        }

        const adapter = await getAdapter(context);
        const page = await getResource<PageDSL>(adapter, "pages", sanitizedId);
        const pageVersionPins = await adapter.getPageVersionPins(sanitizedId);
        assertExpectedVersion(
          page,
          input.expectedVersion,
          pageVersionPins?.draftVersion ?? pageVersionPins?.currentVersion,
        );

        const normalizedBlocks = normalizeNodesIcons(
          input.blocks as BuilderNode[],
        );
        const isDestructiveBlankOverwrite =
          Array.isArray(page.nodes) &&
          page.nodes.length > 0 &&
          normalizedBlocks.length === 0;

        if (isDestructiveBlankOverwrite && !input.nonce) {
          throw createError(
            ERROR_CODES.INVALID_NONCE,
            "A fresh page nonce is required to replace a non-empty page with an empty canvas",
            {
              id: sanitizedId,
              previousNodeCount: page.nodes.length,
            },
          );
        }

        if (isDestructiveBlankOverwrite && input.nonce) {
          await requireValidComposeNonce(context, sanitizedId, input.nonce);
        }

        const nextLayout =
          input.layout !== undefined
            ? normalizePageLayoutRef(input.layout)
            : normalizePageLayoutRef(page.layout);

        await assertPageLayoutChangeAllowed(context, page.layout, nextLayout);

        // Update page with new blocks and layout
        // Strip server-derived tracking fields (e.g. isModifiedSincePublish)
        // that are computed on read but not part of the stored PageDSL schema.
        const { isModifiedSincePublish: _, ...pageRest } = page;
        const updatedPage = {
          ...pageRest,
          nodes: normalizedBlocks,
          layout: nextLayout,
          status: page.status || ("draft" as const),
          updatedAt: new Date().toISOString(),
        };

        const version = await saveResource(
          adapter,
          context,
          "pages",
          sanitizedId,
          updatedPage as PageDSL,
          authorship,
          {
            locals: context.locals,
            versionSaveOptions: { expectedVersion: input.expectedVersion },
          },
        );

        await savePageSnapshot(
          {
            page: updatedPage as PageDSL,
            stage: "draft",
          },
          adapter,
          { locals: context.locals },
        );

        if (isDestructiveBlankOverwrite && input.nonce) {
          await consumeComposeNonceAfterSave(context, sanitizedId, input.nonce);
        }

        const duration = endPerformanceTracking(operation);
        log("info", `Page saved: ${sanitizedId}`, {
          version,
          nodeCount: normalizedBlocks.length,
          duration: `${duration}ms`,
        });

        return { version };
      } catch (error) {
        endPerformanceTracking(operation);
        return handleError(error, operation);
      }
    },
  }),

  /**
   * Save component with nonce validation
   *
   * Bulk save of entire component node tree.
   */
  component: defineAction({
    accept: "json",
    input: z.object({
      id: IdSchema,
      blocks: z.array(BuilderNodeSchema),
      name: z.string().optional(),
      category: z.string().optional(),
      description: z.string().optional(),
      nonce: z.string().optional(),
      expectedVersion: z.string().trim().min(1).optional(),
    }),
    handler: async (input, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "save.component",
        "save-component",
      );

      const operation = `saveComponent:${input.id}`;
      startPerformanceTracking(operation);

      try {
        const sanitizedId = sanitizeInput(input.id);
        if (!validateSlug(sanitizedId)) {
          throw createError(
            ERROR_CODES.INVALID_INPUT,
            `Invalid component ID format: ${input.id}`,
          );
        }

        const adapter = await getAdapter(context);
        const component = await getResource<ComponentDSL>(
          adapter,
          "components",
          sanitizedId,
        );
        assertExpectedVersion(component, input.expectedVersion);

        const normalizedBlocks = normalizeNodesIcons(
          input.blocks as BuilderNode[],
        );

        // Update component with new blocks and metadata
        const updatedComponent = {
          ...component,
          nodes: normalizedBlocks,
          name: input.name ?? component.name,
          category: input.category ?? component.category,
          description: input.description ?? component.description,
          updatedAt: new Date().toISOString(),
        };

        const version = await saveResource(
          adapter,
          context,
          "components",
          sanitizedId,
          updatedComponent,
          authorship,
          {
            locals: context.locals,
            versionSaveOptions: { expectedVersion: input.expectedVersion },
          },
        );

        const duration = endPerformanceTracking(operation);
        log("info", `Component saved: ${sanitizedId}`, {
          version,
          nodeCount: normalizedBlocks.length,
          duration: `${duration}ms`,
        });

        return { version, success: true };
      } catch (error) {
        endPerformanceTracking(operation);
        return handleError(error, operation);
      }
    },
  }),

  /**
   * Save layout with nonce validation
   *
   * Bulk save of entire layout node tree.
   */
  layout: defineAction({
    accept: "json",
    input: z.object({
      id: IdSchema,
      blocks: z.array(BuilderNodeSchema),
      title: z.string().optional(),
      nonce: z.string().optional(),
      expectedVersion: z.string().trim().min(1).optional(),
    }),
    handler: async (input, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "save.layout",
        "save-layout",
      );

      const operation = `saveLayout:${input.id}`;
      startPerformanceTracking(operation);

      try {
        const sanitizedId = sanitizeInput(input.id);
        if (!validateSlug(sanitizedId)) {
          throw createError(
            ERROR_CODES.INVALID_INPUT,
            `Invalid layout ID format: ${input.id}`,
          );
        }

        const adapter = await getAdapter(context);
        const layout = await getResource<LayoutDSL>(
          adapter,
          "layouts",
          sanitizedId,
        );
        assertExpectedVersion(layout, input.expectedVersion);

        const normalizedBlocks = normalizeNodesIcons(
          input.blocks as BuilderNode[],
        );

        // Update layout with new blocks and metadata
        const updatedLayout = {
          ...layout,
          nodes: normalizedBlocks,
          title: input.title ?? layout.title,
          updatedAt: new Date().toISOString(),
        };

        const version = await saveResource(
          adapter,
          context,
          "layouts",
          sanitizedId,
          updatedLayout,
          authorship,
          {
            locals: context.locals,
            versionSaveOptions: { expectedVersion: input.expectedVersion },
          },
        );

        const duration = endPerformanceTracking(operation);
        log("info", `Layout saved: ${sanitizedId}`, {
          version,
          nodeCount: normalizedBlocks.length,
          duration: `${duration}ms`,
        });

        return { version, success: true };
      } catch (error) {
        endPerformanceTracking(operation);
        return handleError(error, operation);
      }
    },
  }),
};
