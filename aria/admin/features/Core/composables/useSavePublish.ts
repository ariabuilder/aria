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
import { commitSavedComponentToClientCaches } from "./componentCacheCoherence";
import { invalidateComposeCache } from "../../../composables/composeClientCache";
import { unwrapItemLoadingComposeResult } from "../../../composables/itemLoadingActionResults";
import {
  JsonObjectSchema,
  LayoutDSLSchema,
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
    version: z.string().trim().min(1),
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
    currentDocumentMatchesSavedDraft?: boolean,
  ) => void | Promise<void>;
}

export interface SavePublishReturn {
  handleSave: () => Promise<void>;
  handlePublish: () => Promise<boolean>;
  handleSaveAndPublish: (options?: {
    showSuccessToast?: boolean;
  }) => Promise<void>;
  handleUnpublish: () => Promise<void>;
  createSnapshot: (blocks: BuilderNode[]) => string;
  sanitizeNodes: (nodes: BuilderNode[]) => BuilderNode[];
  currentVersion: Ref<string | null>;
  saveConflict: Ref<boolean>;
  /** Load the authoritative server draft without overwriting local recovery. */
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

  function markLayoutSlotsSaved(): void {
    layoutSlotsSnapshot.value = snapshotLayoutSlots(currentLayout.value);
  }

  function markPageSaved(
    pageId: string,
    updatedAt: string,
    version: string,
    persistedSnapshot: string,
    currentDocumentMatchesSavedDraft: boolean,
  ): void {
    if (currentItemType.value !== "page" || currentPage.value?.id !== pageId) {
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
    hasUnsavedChanges.value = !currentDocumentMatchesSavedDraft;
    syncDirtyState(true);
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
      error.message?.toLowerCase().includes("changed by another editor") ===
        true ||
      error.message?.toLowerCase().includes("draft is out of date") === true ||
      error.message?.toLowerCase().includes("version conflict") === true
    );
  }

  function expectedVersionFor(
    document: PageDSL | LayoutDSL | ComponentDSL,
  ): string {
    if (!document.version) {
      throw new Error(
        "This item has no current version. Reload Composer before saving.",
      );
    }
    return document.version;
  }

  function actionErrorToError(error: {
    message?: string;
    code?: string;
  }): Error {
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
   * Load the authoritative server draft after a conflict. The conflicting
   * local tree remains in IndexedDB recovery and is never paired with a fresh
   * server version token.
   */
  async function resolveSaveConflict(): Promise<boolean> {
    const itemType = currentItemType.value;
    const slug = activeComposeSlug();
    if (!slug) {
      return false;
    }

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
      const serverBlocks = Array.isArray(composed.data.pageBlocks)
        ? composed.data.pageBlocks
        : [];

      if (itemType === "page" && currentPage.value) {
        currentPage.value = {
          ...currentPage.value,
          ...composed.data.pageMetadata,
          version: serverVersion,
          nodes: serverBlocks,
        };
        const serverLayout = composed.data.currentLayout;
        if (serverLayout) {
          currentLayout.value = LayoutDSLSchema.parse({
            id: serverLayout.id,
            name: serverLayout.title ?? serverLayout.slug ?? serverLayout.id,
            slug: serverLayout.slug,
            title: serverLayout.title,
            version: serverLayout.version,
            nodes: [],
            slots: JSON.parse(
              JSON.stringify(serverLayout.slots ?? []),
            ) as LayoutDSL["slots"],
            metadata: {
              regions: JSON.parse(
                JSON.stringify(serverLayout.regions ?? {}),
              ) as NonNullable<LayoutDSL["metadata"]>["regions"],
            },
          });
        } else {
          currentLayout.value = null;
        }
        markLayoutSlotsSaved();
      } else if (itemType === "layout" && currentLayout.value) {
        currentLayout.value = {
          ...currentLayout.value,
          version: serverVersion,
          nodes: serverBlocks,
        };
      } else if (itemType === "component" && currentComponent.value) {
        currentComponent.value = {
          ...currentComponent.value,
          version: serverVersion,
          nodes: serverBlocks,
        };
      } else {
        return false;
      }

      pageBlocks.value = serverBlocks;
      lastSavedSnapshot.value = createSnapshot(serverBlocks);
      hasUnsavedChanges.value = false;
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

  function syncDirtyState(preserveExistingDirty = false): void {
    const pageDirty =
      createSnapshot(pageBlocks.value) !== lastSavedSnapshot.value;
    const layoutDirty =
      snapshotLayoutSlots(currentLayout.value) !== layoutSlotsSnapshot.value;
    hasUnsavedChanges.value =
      pageDirty ||
      layoutDirty ||
      (preserveExistingDirty && hasUnsavedChanges.value);
  }

  async function savePageWithNonceRetry(
    page: PageDSL,
    sanitizedBlocks: BuilderNode[],
    layout: string | undefined,
    initialNonce: string | null,
    layoutDraft?: {
      id: string;
      expectedVersion: string;
      dsl: LayoutDSL;
    },
  ): Promise<SaveActionData> {
    let nonce = initialNonce;
    for (let attempt = 0; attempt < 2; attempt++) {
      const actionResult = await actions.savePage({
        id: page.id,
        blocks: sanitizedBlocks,
        title: page.title,
        description: page.description,
        layout,
        settings: page.settings
          ? JsonObjectSchema.parse(JSON.parse(JSON.stringify(page.settings)))
          : undefined,
        nonce: nonce ?? undefined,
        expectedVersion: expectedVersionFor(page),
        ...(layoutDraft ? { layoutDraft } : {}),
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
        if (
          currentItemType.value !== "page" ||
          currentPage.value?.id !== page.id
        ) {
          throw new Error(
            "The edited page changed while saving. Return to it and try again.",
          );
        }
        const refreshed = await refreshComposeNonceFromServer();
        if (refreshed) {
          nonce = composeNonce.value;
          continue;
        }
      }

      log("error", "[useSavePublish] Save failed", { error });
      throw actionErrorToError(error as { message?: string; code?: string });
    }

    throw new Error("Failed to save page");
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
      const pageToSave = currentPage.value
        ? (JSON.parse(JSON.stringify(currentPage.value)) as PageDSL)
        : null;
      const layoutToSave = currentLayout.value
        ? (JSON.parse(JSON.stringify(currentLayout.value)) as LayoutDSL)
        : null;
      const componentToSave = currentComponent.value
        ? (JSON.parse(JSON.stringify(currentComponent.value)) as ComponentDSL)
        : null;
      const nonceToSave = composeNonce.value;
      saveConflict.value = false;
      const updatedAt = new Date().toISOString();
      const draftBlocksSnapshot = JSON.stringify(pageBlocks.value);
      const sanitizedBlocks = sanitizeNodes(pageBlocks.value);
      const persistedBlocksSnapshot = JSON.stringify(sanitizedBlocks);
      const pagePayloadSnapshot =
        pageToSave && itemType === "page"
          ? JSON.stringify({
              id: pageToSave.id,
              title: pageToSave.title,
              description: pageToSave.description,
              layout: pageToSave.layout,
              settings: pageToSave.settings,
              nodes: sanitizedBlocks,
            })
          : null;
      const layoutDocumentSnapshot =
        layoutToSave && itemType === "layout"
          ? JSON.stringify(
              layoutPayloadForStorage({
                ...layoutToSave,
                nodes: sanitizedBlocks,
              }),
            )
          : null;
      const componentDocumentSnapshot =
        componentToSave && itemType === "component"
          ? JSON.stringify({
              id: componentToSave.id,
              name: componentToSave.name,
              category: componentToSave.category,
              description: componentToSave.description,
              nodes: sanitizedBlocks,
            })
          : null;

      if (itemType === "page" && pageToSave) {
        const layoutDirty =
          layoutToSave &&
          snapshotLayoutSlots(layoutToSave) !== layoutSlotsSnapshot.value;

        // hasUnsavedChanges also covers staged page metadata. Save the whole
        // page document even when only title/settings changed, and create one
        // guarded revision for the explicit Save draft operation.
        const saveData = await savePageWithNonceRetry(
          pageToSave,
          sanitizedBlocks,
          pageToSave.layout,
          nonceToSave,
          layoutDirty && layoutToSave
            ? {
                id: layoutToSave.slug ?? layoutToSave.id,
                expectedVersion: expectedVersionFor(layoutToSave),
                dsl: LayoutDSLSchema.parse(layoutToSave),
              }
            : undefined,
        );
        if (layoutDirty && !saveData.layoutVersion) {
          throw new Error("Invalid atomic page save response");
        }
        if (
          layoutDirty &&
          layoutToSave &&
          saveData.layoutVersion &&
          currentLayout.value?.id === layoutToSave.id
        ) {
          currentLayout.value.version = saveData.layoutVersion;
          layoutSlotsSnapshot.value = snapshotLayoutSlots(layoutToSave);
        }
        const sameActivePage =
          currentItemType.value === "page" &&
          currentPage.value?.id === pageToSave.id;
        const currentDocumentMatchesSavedDraft =
          sameActivePage &&
          JSON.stringify({
            id: currentPage.value!.id,
            title: currentPage.value!.title,
            description: currentPage.value!.description,
            layout: currentPage.value!.layout,
            settings: currentPage.value!.settings,
            nodes: sanitizeNodes(pageBlocks.value),
          }) === pagePayloadSnapshot &&
          snapshotLayoutSlots(currentLayout.value) ===
            snapshotLayoutSlots(layoutToSave);
        if (sameActivePage) {
          refreshComposeNonce(saveData);
          markPageSaved(
            pageToSave.id,
            updatedAt,
            saveData.version,
            persistedBlocksSnapshot,
            currentDocumentMatchesSavedDraft,
          );
          await onDraftSynced?.(
            saveData.version,
            draftBlocksSnapshot,
            currentDocumentMatchesSavedDraft,
          );
        }
        markPageThumbnailStale(pageToSave.id);
        await refreshPagesNow();
      } else if (itemType === "layout" && layoutToSave) {
        const layoutPayload = LayoutDSLSchema.parse({
          ...layoutToSave,
          nodes: sanitizedBlocks,
        });
        const layoutSlug = layoutToSave.slug ?? layoutToSave.id;
        const layoutResult = await actions.updateItem({
          collection: "layouts",
          slug: layoutSlug,
          data: layoutPayloadForStorage(layoutPayload),
          expectedVersion: expectedVersionFor(layoutToSave),
        });
        if (layoutResult.error) {
          throw actionErrorToError(
            layoutResult.error as { message?: string; code?: string },
          );
        }
        const layoutVersion = (
          layoutResult.data as { version?: unknown } | undefined
        )?.version;
        if (typeof layoutVersion !== "string" || layoutVersion.length === 0) {
          throw new Error("Invalid layout save response");
        }

        if (
          currentItemType.value === "layout" &&
          currentLayout.value?.id === layoutToSave.id
        ) {
          const currentDocumentMatchesSavedDraft =
            JSON.stringify(
              layoutPayloadForStorage({
                ...currentLayout.value,
                nodes: sanitizeNodes(pageBlocks.value),
              }),
            ) === layoutDocumentSnapshot;
          currentLayout.value.updatedAt = updatedAt;
          currentLayout.value.version = layoutVersion;
          currentVersion.value = layoutVersion;
          lastSavedSnapshot.value = persistedBlocksSnapshot;
          layoutSlotsSnapshot.value = snapshotLayoutSlots(layoutToSave);
          hasUnsavedChanges.value = !currentDocumentMatchesSavedDraft;
          syncDirtyState(true);
          await onDraftSynced?.(
            layoutVersion,
            draftBlocksSnapshot,
            currentDocumentMatchesSavedDraft,
          );
        }
      } else if (itemType === "component" && componentToSave) {
        const saveData = await saveComponentWithNonceRetry(
          componentToSave,
          sanitizedBlocks,
        );

        const savedComponent: ComponentDSL = {
          ...componentToSave,
          nodes: sanitizedBlocks,
          updatedAt,
          version: saveData.version,
        };
        commitSavedComponentToClientCaches(savedComponent);
        invalidateComposeCache("component", savedComponent.id);
        markComponentThumbnailStale(savedComponent.id);

        if (
          currentItemType.value === "component" &&
          currentComponent.value?.id === componentToSave.id
        ) {
          const currentDocumentMatchesSavedDraft =
            JSON.stringify({
              id: currentComponent.value.id,
              name: currentComponent.value.name,
              category: currentComponent.value.category,
              description: currentComponent.value.description,
              nodes: sanitizeNodes(pageBlocks.value),
            }) === componentDocumentSnapshot;
          refreshComposeNonce(saveData);
          currentComponent.value.updatedAt = updatedAt;
          currentComponent.value.version = saveData.version;
          currentVersion.value = saveData.version;
          lastSavedSnapshot.value = persistedBlocksSnapshot;
          hasUnsavedChanges.value = !currentDocumentMatchesSavedDraft;
          syncDirtyState(true);
          await onDraftSynced?.(
            saveData.version,
            draftBlocksSnapshot,
            currentDocumentMatchesSavedDraft,
          );
        }
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
      syncDirtyState(true);
    }
  };

  /**
   * Handle save operation with proper state management
   */
  const handleSave = async (): Promise<void> => {
    await enqueueSave(performSave);
  };

  /**
   * Handle publish operation (pages only)
   */
  const handlePublish = async (
    options: { skipSave?: boolean } = {},
  ): Promise<boolean> => {
    if (currentItemType.value !== "page") {
      toast.error("Only pages can be published");
      return false;
    }

    if (loadingState.value.isPublishing) {
      return false;
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
        if (hasUnsavedChanges.value || saveConflict.value) {
          return false;
        }
      }
      if (hasUnsavedChanges.value) {
        throw new Error("Save the current draft before publishing");
      }

      const publishingPageId = currentPage.value.id;
      const publishingPageSlug = currentPage.value.slug;
      const requestedVersion = expectedVersionFor(currentPage.value);
      const requestedBlocksSnapshot = createSnapshot(pageBlocks.value);

      // Use the publish action to advance the page's published revision.
      const result = await actions.publishing.publish({
        id: publishingPageId,
        expectedVersion: requestedVersion,
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
        throw actionErrorToError(
          result.error as { message?: string; code?: string },
        );
      }

      if (result.data) {
        const publishedData = parsePublishActionData(result.data);
        if (publishedData.version !== requestedVersion) {
          throw new Error(
            "Published revision did not match the requested saved draft",
          );
        }
        log("info", "[useSavePublish] Page published", {
          slug: publishedData.slug,
          htmlSize: `${(publishedData.htmlSize / 1024).toFixed(2)}KB`,
          withCompiledCSS: publishedData.globalCSSEnabled,
        });

        if (currentPage.value?.id === publishingPageId) {
          const draftAdvancedWhilePublishing =
            currentPage.value.version !== requestedVersion ||
            createSnapshot(pageBlocks.value) !== requestedBlocksSnapshot ||
            hasUnsavedChanges.value;

          currentPage.value.status = "published";
          currentPage.value.isModifiedSincePublish =
            draftAdvancedWhilePublishing;
          if (!draftAdvancedWhilePublishing) {
            currentPage.value.version = publishedData.version;
            currentVersion.value = publishedData.version;
          } else {
            currentVersion.value = currentPage.value.version ?? null;
          }
        }

        invalidateComposeCache("page", publishingPageSlug);
        markPageThumbnailStale(publishingPageId);
        await refreshPagesNow();
        return true;
      }
      return false;
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
      return false;
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
    if (hasUnsavedChanges.value || saveConflict.value) {
      return;
    }
    let completed = true;
    if (currentItemType.value === "page") {
      completed = await handlePublish({ skipSave: true });
    }
    if (showSuccessToast && completed) {
      toast.success(
        currentItemType.value === "page" ? "Page published" : "Draft saved",
      );
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
