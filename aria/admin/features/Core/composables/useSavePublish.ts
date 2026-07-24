/**
 * UseSavePublish Handles save and publish operations for
 * pages, layouts, and components. Extracted from App.
 */

import { ref, type Ref } from "vue";
import { actions } from "astro:actions";
import { toast } from "vue-sonner";
import { z } from "zod";
import { log } from "@/lib/utils/logger";
import {
  parseSaveActionData,
  type SaveActionData,
} from "../../../composables/saveActionResults";
import { useBuilderData } from "@/composables/useBuilderData";
import { markPageThumbnailStale } from "@/features/Studio/pages/composables/pageThumbnailInvalidation";
import { markComponentThumbnailStale } from "@/features/Studio/components/composables/componentThumbnailInvalidation";
import { invalidateComposeCache } from "../../../composables/composeClientCache";
import { unwrapItemLoadingComposeResult } from "../../../composables/itemLoadingActionResults";
import {
  JsonObjectSchema,
  LayoutDSLSchema,
  PageDSLSchema,
} from "../../../../lib/schemas/nodes";
import { snapshotLayoutSlots } from "../../../../lib/layouts/slotEditing";
import type {
  BuilderNode,
  JsonObject,
  PageDSL,
  LayoutDSL,
  ComponentDSL,
} from "../../../../lib/types/nodes";

/** JSON round-trip omits `undefined` keys before JsonObjectSchema validation. */
function layoutPayloadForStorage(layout: LayoutDSL): JsonObject {
  return JsonObjectSchema.parse(JSON.parse(JSON.stringify(layout)));
}

const PublishActionDataSchema = z
  .object({
    slug: z.string().trim().min(1),
    htmlSize: z.number().nonnegative(),
    globalCSSEnabled: z.boolean(),
    framework: z.string().optional(),
    darkMode: z.string().optional(),
    timestamp: z.string().optional(),
    published: z.boolean().optional(),
  })
  .strict();

const PublishActionSuccessSchema = z
  .object({
    success: z.literal(true),
    data: PublishActionDataSchema,
  })
  .strict();

const PublishActionFailureSchema = z
  .object({
    success: z.literal(false),
    error: z.looseObject({
      message: z.string().trim().min(1),
    }),
  })
  .strict();

const PublishActionResultSchema = z.discriminatedUnion("success", [
  PublishActionSuccessSchema,
  PublishActionFailureSchema,
]);

type PublishActionData = z.infer<typeof PublishActionDataSchema>;

export interface SavePublishDeps {
  pageBlocks: Ref<BuilderNode[]>;
  currentPage: Ref<PageDSL | null>;
  currentLayout: Ref<LayoutDSL | null>;
  currentComponent: Ref<ComponentDSL | null>;
  currentItemType: Ref<"page" | "layout" | "component">;
  composeNonce: Ref<string | null>;
  hasUnsavedChanges: Ref<boolean>;
  lastSavedSnapshot: Ref<string>;
  layoutSlotsSnapshot: Ref<string>;
  loadingState: Ref<{
    isLoading: boolean;
    isSaving: boolean;
    isPublishing: boolean;
    loadError: string | null;
  }>;
  onDraftSynced?: (
    version: string,
    persistedBlocksSnapshot: string,
  ) => void | Promise<void>;
}

export interface SavePublishReturn {
  handleSave: () => Promise<void>;
  handlePublish: () => Promise<void>;
  handleSaveAndPublish: (options?: {
    showSuccessToast?: boolean;
  }) => Promise<void>;
  handleUnpublish: () => Promise<void>;
  createSnapshot: (blocks: BuilderNode[]) => string;
  sanitizeNodes: (nodes: BuilderNode[]) => BuilderNode[];
  currentVersion: Ref<string | null>;
  saveConflict: Ref<boolean>;
  /**
   * Refresh authoritative version pins from the server without a full page
   * reload, then re-apply the user's local blocks so they can save again.
   */
  resolveSaveConflict: () => Promise<boolean>;
}

export function useSavePublish(deps: SavePublishDeps): SavePublishReturn {
  const {
    pageBlocks,
    currentPage,
    currentLayout,
    currentComponent,
    currentItemType,
    composeNonce,
    hasUnsavedChanges,
    lastSavedSnapshot,
    layoutSlotsSnapshot,
    loadingState,
    onDraftSynced,
  } = deps;

  const currentVersion = ref<string | null>(null);
  const saveConflict = ref(false);
  const { refreshPagesNow } = useBuilderData();

  function parsePublishActionData(payload: unknown): PublishActionData {
    const parsed = PublishActionResultSchema.safeParse(payload);

    if (!parsed.success) {
      throw new Error("Invalid publish response");
    }

    if (!parsed.data.success) {
      const errorWithCode = parsed.data.error as unknown as {
        code?: unknown;
      };
      throw Object.assign(new Error(parsed.data.error.message), {
        code:
          typeof errorWithCode.code === "string"
            ? errorWithCode.code
            : undefined,
      });
    }

    return parsed.data.data;
  }

  function parseReloadedPage(payload: unknown): PageDSL | null {
    const parsed = PageDSLSchema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  }

  function markLayoutSlotsSaved(): void {
    layoutSlotsSnapshot.value = snapshotLayoutSlots(currentLayout.value);
  }

  function markPageSaved(
    updatedAt: string,
    version: string,
    persistedSnapshot: string,
  ): void {
    if (!currentPage.value) {
      return;
    }

    // Preserve publication status — only set to draft if not already published/archived
    if (!currentPage.value.status || currentPage.value.status === "draft") {
      currentPage.value.status = "draft";
    } else if (currentPage.value.status === "published") {
      currentPage.value.isModifiedSincePublish = true;
    }

    currentPage.value.updatedAt = updatedAt;
    currentPage.value.version = version;
    currentVersion.value = version;
    lastSavedSnapshot.value = persistedSnapshot;
    syncDirtyState();
    invalidateComposeCache("page", currentPage.value.slug);
  }

  function refreshComposeNonce(saveData: SaveActionData): void {
    if (saveData.nonce) {
      composeNonce.value = saveData.nonce;
    }
  }

  function isInvalidNonceMessage(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
      normalized.includes("invalid or expired nonce") ||
      normalized.includes("invalid_nonce") ||
      normalized.includes("nonce validation failed")
    );
  }

  function isInvalidNonceError(error: {
    message?: string;
    code?: string;
  }): boolean {
    if (error.code === "INVALID_NONCE") {
      return true;
    }

    return error.message ? isInvalidNonceMessage(error.message) : false;
  }

  function isVersionConflictError(error: {
    message?: string;
    code?: string;
  }): boolean {
    return (
      error.code === "VERSION_CONFLICT" ||
      error.message?.toLowerCase().includes("changed by another editor") === true ||
      error.message?.toLowerCase().includes("draft is out of date") === true ||
      error.message?.toLowerCase().includes("version conflict") === true
    );
  }

  function expectedVersionFor(
    document: PageDSL | LayoutDSL | ComponentDSL,
  ): string {
    if (!document.version) {
      throw new Error("This item has no current version. Reload Composer before saving.");
    }
    return document.version;
  }

  function actionErrorToError(error: { message?: string; code?: string }): Error {
    return Object.assign(new Error(error.message || "Failed to save"), {
      code: error.code,
    });
  }

  function activeComposeSlug(): string | null {
    const itemType = currentItemType.value;
    if (itemType === "page" && currentPage.value) {
      return currentPage.value.slug;
    }
    if (itemType === "layout" && currentLayout.value) {
      return currentLayout.value.slug ?? currentLayout.value.id;
    }
    if (itemType === "component" && currentComponent.value) {
      return currentComponent.value.id ?? null;
    }
    return null;
  }

  async function refreshComposeNonceFromServer(): Promise<boolean> {
    const itemType = currentItemType.value;
    const slug = activeComposeSlug();

    if (!slug) {
      return false;
    }

    const result = await actions.compose({
      pageSlug: slug,
      itemType,
    });
    const composed = unwrapItemLoadingComposeResult(
      result,
      "Failed to refresh compose nonce",
      { slug, itemType },
    );

    if (!composed.success) {
      return false;
    }

    composeNonce.value = composed.data.nonce;
    return true;
  }

  let saveChain: Promise<void> = Promise.resolve();

  function enqueueSave(task: () => Promise<void>): Promise<void> {
    const run = saveChain.then(task);
    saveChain = run.catch(() => {});
    return run;
  }

  /**
   * Sanitize nodes before saving to ensure schema compliance
   * Specifically fixes missing reference.type for component nodes
   */
  const sanitizeNodes = (nodes: BuilderNode[]): BuilderNode[] => {
    return nodes
      .filter((node) => !node.metadata?.layoutDefaultInjected)
      .map((node) => {
        const newNode = { ...node };

        if (
          newNode.type === "Component" &&
          newNode.reference &&
          !newNode.reference.type
        ) {
          newNode.reference = {
            ...newNode.reference,
            type: "instance",
          };
        }

        if (newNode.children && newNode.children.length > 0) {
          newNode.children = sanitizeNodes(newNode.children);
        }

        return newNode;
      });
  };

  /**
   * Snapshot of persisted block state (matches what save sends to the server).
   */
  const createSnapshot = (blocks: BuilderNode[]): string => {
    return JSON.stringify(sanitizeNodes(blocks));
  };

  /**
   * Soft conflict recovery: pull fresh version pins from compose, keep the
   * user's local canvas blocks, and clear the conflict flag. Avoids
   * location.reload(), which rehydrates a stale session version and loops.
   */
  async function resolveSaveConflict(): Promise<boolean> {
    const itemType = currentItemType.value;
    const slug = activeComposeSlug();
    if (!slug) {
      return false;
    }

    const localBlocks = JSON.parse(
      JSON.stringify(pageBlocks.value),
    ) as BuilderNode[];

    if (itemType === "page") {
      invalidateComposeCache("page", slug);
    } else if (itemType === "component") {
      invalidateComposeCache("component", slug);
    }

    try {
      const result = await actions.compose({
        pageSlug: slug,
        itemType,
      });
      const composed = unwrapItemLoadingComposeResult(
        result,
        "Failed to refresh server version",
        { slug, itemType },
      );

      if (!composed.success) {
        return false;
      }

      const serverVersion = composed.data.pageMetadata.version;
      if (typeof serverVersion !== "string" || serverVersion.length === 0) {
        return false;
      }

      composeNonce.value = composed.data.nonce;
      currentVersion.value = serverVersion;

      if (itemType === "page" && currentPage.value) {
        currentPage.value = {
          ...currentPage.value,
          version: serverVersion,
          updatedAt:
            composed.data.pageMetadata.updatedAt ?? currentPage.value.updatedAt,
          nodes: localBlocks,
        };
      } else if (itemType === "layout" && currentLayout.value) {
        currentLayout.value = {
          ...currentLayout.value,
          version: serverVersion,
          nodes: localBlocks,
        };
      } else if (itemType === "component" && currentComponent.value) {
        currentComponent.value = {
          ...currentComponent.value,
          version: serverVersion,
          nodes: localBlocks,
        };
      } else {
        return false;
      }

      // Baseline against the server tree so local blocks remain dirty.
      lastSavedSnapshot.value = createSnapshot(
        Array.isArray(composed.data.pageBlocks) ? composed.data.pageBlocks : [],
      );
      pageBlocks.value = localBlocks;
      hasUnsavedChanges.value = true;
      saveConflict.value = false;
      return true;
    } catch (error) {
      log("error", "[useSavePublish] Failed to resolve save conflict", {
        error: error instanceof Error ? error.message : String(error),
        slug,
        itemType,
      });
      return false;
    }
  }

  function syncDirtyState(): void {
    const pageDirty =
      createSnapshot(pageBlocks.value) !== lastSavedSnapshot.value;
    const layoutDirty =
      snapshotLayoutSlots(currentLayout.value) !== layoutSlotsSnapshot.value;
    hasUnsavedChanges.value = pageDirty || layoutDirty;
  }

  async function savePageWithNonceRetry(
    pageId: string,
    sanitizedBlocks: BuilderNode[],
    layout: string | undefined,
  ): Promise<SaveActionData> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const actionResult = await actions.savePage({
        id: pageId,
        blocks: sanitizedBlocks,
        layout,
        nonce: composeNonce.value ?? undefined,
        expectedVersion: expectedVersionFor(currentPage.value!),
      });

      if (!actionResult.error) {
        return parseSaveActionData(actionResult.data, "page");
      }

      const error = actionResult.error;
      if (
        attempt === 0 &&
        isInvalidNonceError({
          message: error.message,
          code: (error as { code?: string }).code,
        })
      ) {
        const refreshed = await refreshComposeNonceFromServer();
        if (refreshed) {
          continue;
        }
      }

      log("error", "[useSavePublish] Save failed", { error });
      throw actionErrorToError(error as { message?: string; code?: string });
    }

    throw new Error("Failed to save page");
  }

  async function saveLayoutWithNonceRetry(
    layout: LayoutDSL,
    sanitizedBlocks: BuilderNode[],
  ): Promise<SaveActionData> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const actionResult = await actions.saveLayout({
        id: layout.id,
        blocks: sanitizedBlocks,
        title: layout.title,
        expectedVersion: expectedVersionFor(layout),
      });

      if (!actionResult.error) {
        return parseSaveActionData(actionResult.data, "layout");
      }

      const error = actionResult.error;
      if (
        attempt === 0 &&
        isInvalidNonceError({
          message: error.message,
          code: (error as { code?: string }).code,
        })
      ) {
        const refreshed = await refreshComposeNonceFromServer();
        if (refreshed) {
          continue;
        }
      }

      throw actionErrorToError(error as { message?: string; code?: string });
    }

    throw new Error("Failed to save layout");
  }

  async function saveComponentWithNonceRetry(
    component: ComponentDSL,
    sanitizedBlocks: BuilderNode[],
  ): Promise<SaveActionData> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const actionResult = await actions.saveComponent({
        id: component.id,
        blocks: sanitizedBlocks,
        name: component.name,
        category: component.category,
        description: component.description,
        expectedVersion: expectedVersionFor(component),
      });

      if (!actionResult.error) {
        return parseSaveActionData(actionResult.data, "component");
      }

      const error = actionResult.error;
      if (
        attempt === 0 &&
        isInvalidNonceError({
          message: error.message,
          code: (error as { code?: string }).code,
        })
      ) {
        const refreshed = await refreshComposeNonceFromServer();
        if (refreshed) {
          continue;
        }
      }

      throw actionErrorToError(error as { message?: string; code?: string });
    }

    throw new Error("Failed to save component");
  }

  const performSave = async (): Promise<void> => {
    if (!hasUnsavedChanges.value) {
      log("debug", "[useSavePublish] No changes detected - skipping save");
      return;
    }

    if (currentItemType.value === "page" && !currentPage.value) {
      log("error", "[useSavePublish] No current page to save");
      return;
    }

    log("debug", "[useSavePublish] Changes detected - saving");
    loadingState.value.isSaving = true;

    try {
      const itemType = currentItemType.value;
      saveConflict.value = false;
      const updatedAt = new Date().toISOString();
      const draftBlocksSnapshot = JSON.stringify(pageBlocks.value);
      const sanitizedBlocks = sanitizeNodes(pageBlocks.value);
      const persistedBlocksSnapshot = JSON.stringify(sanitizedBlocks);

      if (itemType === "page" && currentPage.value) {
        const layoutDirty =
          currentLayout.value &&
          snapshotLayoutSlots(currentLayout.value) !==
            layoutSlotsSnapshot.value;

        if (layoutDirty && currentLayout.value) {
          const layoutSlug = currentLayout.value.slug ?? currentLayout.value.id;
          const layoutPayload = LayoutDSLSchema.parse(currentLayout.value);
          const layoutResult = await actions.updateItem({
            collection: "layouts",
            slug: layoutSlug,
            data: layoutPayloadForStorage(layoutPayload),
            expectedVersion: expectedVersionFor(currentLayout.value),
          });

          if (layoutResult.error) {
            if (
              isVersionConflictError({
                message: layoutResult.error.message,
                code: (layoutResult.error as { code?: string }).code,
              })
            ) {
              saveConflict.value = true;
            }
            throw actionErrorToError(
              layoutResult.error as { message?: string; code?: string },
            );
          }

          const layoutVersion = (layoutResult.data as { version?: unknown } | undefined)
            ?.version;
          if (typeof layoutVersion === "string") {
            currentLayout.value.version = layoutVersion;
          }
          markLayoutSlotsSaved();
        }

        const pageDirty =
          createSnapshot(pageBlocks.value) !== lastSavedSnapshot.value;

        if (pageDirty) {
          const saveData = await savePageWithNonceRetry(
            currentPage.value.id,
            sanitizedBlocks,
            currentPage.value.layout,
          );
          refreshComposeNonce(saveData);
          markPageSaved(updatedAt, saveData.version, persistedBlocksSnapshot);
          await onDraftSynced?.(saveData.version, draftBlocksSnapshot);
          markPageThumbnailStale(currentPage.value.id);
          await refreshPagesNow();
        }
      } else if (itemType === "layout" && currentLayout.value) {
        const saveData = await saveLayoutWithNonceRetry(
          currentLayout.value,
          sanitizedBlocks,
        );
        refreshComposeNonce(saveData);

        if (saveData.success) {
          currentLayout.value.updatedAt = updatedAt;
          currentLayout.value.version = saveData.version;
          currentVersion.value = saveData.version;
          lastSavedSnapshot.value = persistedBlocksSnapshot;
          markLayoutSlotsSaved();
          syncDirtyState();
          await onDraftSynced?.(saveData.version, draftBlocksSnapshot);
        }
      } else if (itemType === "component" && currentComponent.value) {
        const saveData = await saveComponentWithNonceRetry(
          currentComponent.value,
          sanitizedBlocks,
        );
        refreshComposeNonce(saveData);

        if (saveData.success) {
          currentComponent.value.updatedAt = updatedAt;
          currentComponent.value.version = saveData.version;
          currentVersion.value = saveData.version;
          lastSavedSnapshot.value = persistedBlocksSnapshot;
          markComponentThumbnailStale(currentComponent.value.id);
          syncDirtyState();
          await onDraftSynced?.(saveData.version, draftBlocksSnapshot);
        }
      }
    } catch (err) {
      if (
        isVersionConflictError({
          message: err instanceof Error ? err.message : undefined,
          code: err && typeof err === "object" ? (err as { code?: string }).code : undefined,
        })
      ) {
        saveConflict.value = true;
      }
      log("error", "Error saving", {
        error: err instanceof Error ? err.message : String(err),
      });
      const errorMsg = err instanceof Error ? err.message : "Failed to save";
      const hint =
        err instanceof Error && isInvalidNonceMessage(err.message)
          ? " Reload the page in Composer if this persists after a dev:edge restart."
          : "";
      toast.error(`${errorMsg}${hint}`);
    } finally {
      loadingState.value.isSaving = false;
      syncDirtyState();
    }
  };

  /**
   * Handle save operation with proper state management
   */
  const handleSave = async (): Promise<void> => {
    await enqueueSave(async () => {
      const snapshotBefore = lastSavedSnapshot.value;
      await performSave();
      if (
        hasUnsavedChanges.value &&
        lastSavedSnapshot.value !== snapshotBefore
      ) {
        await performSave();
      }
    });
  };

  /**
   * Handle publish operation (pages only)
   */
  const handlePublish = async (
    options: { skipSave?: boolean } = {},
  ): Promise<void> => {
    if (currentItemType.value !== "page") {
      toast.error("Only pages can be published");
      return;
    }

    loadingState.value.isPublishing = true;

    try {
      if (!currentPage.value) {
        throw new Error("No page selected to publish");
      }

      // Direct publishing must never bypass the normal draft save path, which
      // also persists edited layout slots and updates local recovery. The
      // combined save-and-publish action has already completed that work.
      if (!options.skipSave) {
        await handleSave();
      }
      if (hasUnsavedChanges.value) {
        throw new Error("Save the current draft before publishing");
      }

      const sanitizedBlocks = sanitizeNodes(pageBlocks.value);

      // Use the publish action to advance the page's published revision.
      const result = await actions.publishing.publish({
        id: currentPage.value.id,
        slug: currentPage.value.slug,
        title: currentPage.value.title,
        description: currentPage.value.description,
        layout: currentPage.value.layout,
        nodes: sanitizedBlocks,
        settings: currentPage.value.settings,
        expectedVersion: expectedVersionFor(currentPage.value),
      });

      if (result.error) {
        if (
          isVersionConflictError({
            message: result.error.message,
            code: (result.error as { code?: string }).code,
          })
        ) {
          saveConflict.value = true;
        }
        throw new Error(result.error.message || "Failed to publish");
      }

      if (result.data) {
        const publishedData = parsePublishActionData(result.data);
        log("info", "[useSavePublish] Page published", {
          slug: publishedData.slug,
          htmlSize: `${(publishedData.htmlSize / 1024).toFixed(2)}KB`,
          withCompiledCSS: publishedData.globalCSSEnabled,
        });

        // Reload page to get updated status from server
        // (Action already marked as published)
        const reloaded = await actions.getItem({
          collection: "pages",
          slug: currentPage.value!.slug,
        });
        const reloadedPage = parseReloadedPage(reloaded.data);
        if (reloadedPage) {
          currentPage.value = reloadedPage;
        } else {
          currentPage.value.status = "published";
        }

        invalidateComposeCache("page", currentPage.value.slug);

        markPageThumbnailStale(currentPage.value.id);
        await refreshPagesNow();
      }
    } catch (err) {
      if (
        isVersionConflictError({
          message: err instanceof Error ? err.message : undefined,
          code:
            err && typeof err === "object"
              ? (err as { code?: string }).code
              : undefined,
        })
      ) {
        saveConflict.value = true;
      }
      log("error", "Publish error", {
        error: err instanceof Error ? err.message : String(err),
      });
      const errorMsg = err instanceof Error ? err.message : "Failed to publish";
      toast.error(errorMsg);
    } finally {
      loadingState.value.isPublishing = false;
    }
  };

  /**
   * Save and, for pages, immediately publish the current item.
   * Layouts and components are saved only.
   */
  const handleSaveAndPublish = async (options?: {
    showSuccessToast?: boolean;
  }): Promise<void> => {
    const showSuccessToast = options?.showSuccessToast ?? true;

    await handleSave();
    if (currentItemType.value === "page") {
      await handlePublish({ skipSave: true });
    }
    if (showSuccessToast) {
      toast.success("Saved");
    }
  };

  /**
   * Set the current page back to draft (unpublish).
   */
  const handleUnpublish = async (): Promise<void> => {
    if (currentItemType.value !== "page" || !currentPage.value) {
      return;
    }

    loadingState.value.isPublishing = true;

    try {
      const result = await actions.publishing.unpublish({
        id: currentPage.value.id,
        slug: currentPage.value.slug,
      });

      if (result.error) {
        throw new Error(result.error.message || "Failed to set as draft");
      }

      currentPage.value.status = "draft";
      invalidateComposeCache("page", currentPage.value.slug);
      markPageThumbnailStale(currentPage.value.id);
      await refreshPagesNow();
      toast.success("Set as draft");
    } catch (err) {
      log("error", "Unpublish error", {
        error: err instanceof Error ? err.message : String(err),
      });
      toast.error(
        err instanceof Error ? err.message : "Failed to set as draft",
      );
    } finally {
      loadingState.value.isPublishing = false;
    }
  };

  return {
    handleSave,
    handlePublish,
    handleSaveAndPublish,
    handleUnpublish,
    createSnapshot,
    sanitizeNodes,
    currentVersion,
    saveConflict,
    resolveSaveConflict,
  };
}
