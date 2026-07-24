import { actions } from "astro:actions";
import { slugify } from "@/lib/utils/slugify";
import { toast } from "vue-sonner";
import type { PageDSL } from "@/lib/types/nodes";
import { log } from "@/lib/utils/logger";
import {
  unwrapStudioCrudActionResult,
  unwrapStudioCrudGetItemResult,
} from "./studioCrudActionResults";
import {
  createStudioCrudContext,
  HOME_PAGE_SLUG,
  CreatePageOptionsSchema,
  RenamePageInputSchema,
  SlugSchema,
  type BulkDeleteResult,
  type CreatePageOptions,
  type StudioCrudContext,
  type StudioDeleteOptions,
} from "./studioCrudShared";
import { resolvePageBatchDeletePlan } from "@/features/Studio/pages/lib/resolvePageBatchDeletePlan";
import { useCapabilities } from "@/composables/useCapabilities";
import { useSlugChangeRedirect } from "@/features/Studio/settings/composables/useSlugChangeRedirect";

export function useStudioPageCrud(ctx: StudioCrudContext = createStudioCrudContext()) {
  const {
    builderData,
    canCreatePage,
    getForbiddenMessage,
    executeStudioOperation,
    recordCreateItem,
    recordDeleteItem,
    recordDeleteItemsBatch,
    isItemLoading,
    generateUniqueSlug,
    toActionData,
  } = ctx;
  const { hasCapability } = useCapabilities();
  const { offerRedirectAfterSlugChange } = useSlugChangeRedirect();

async function fetchPage(slug: string): Promise<PageDSL | null> {
    const parsedSlug = SlugSchema.safeParse(slug);
    if (!parsedSlug.success) {
      return null;
    }

    const result = unwrapStudioCrudGetItemResult(
      "pages",
      await actions.getItem({
        collection: "pages",
        slug: parsedSlug.data,
      }),
      "Failed to load page",
      {
        slug,
        source: "useStudioActions.fetchPage",
      },
    );

    if (!result.success) {
      return null;
    }

    return result.data;
  }

async function loadPageForEditing(slug: string) {
    isItemLoading.value = true;
    try {
      const page = await fetchPage(slug);
      if (!page) {
        throw new Error("Page not found");
      }
      toast.success(`Loaded page: ${slug}`);
    } catch (error) {
      log("error", "[Studio] Failed to load page", {
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error("Failed to load page");
      throw error;
    } finally {
      isItemLoading.value = false;
    }
  }

async function createPage(
    options: CreatePageOptions = {},
  ): Promise<string | null> {
    if (!canCreatePage.value) {
      toast.error(getForbiddenMessage("crud.createItem"));
      return null;
    }

    const parsedOptions = CreatePageOptionsSchema.safeParse(options);
    if (!parsedOptions.success) {
      toast.error("Invalid page options");
      return null;
    }

    const {
      title = "New Page",
      slug: providedSlug,
      parent,
      layout = "",
    } = parsedOptions.data;

    const existingSlugs = builderData.pages.value.map((p) => p.slug);
    const uniqueSlug =
      providedSlug && !existingSlugs.includes(providedSlug)
        ? providedSlug
        : generateUniqueSlug(title, existingSlugs);

    const pageData: PageDSL = {
      id: uniqueSlug,
      slug: uniqueSlug,
      title,
      layout,
      parent: parent ?? undefined,
      status: "draft",
      nodes: [],
      settings: {},
      updatedAt: new Date().toISOString(),
    };

    const createdSlug = await recordCreateItem({
      type: "create-page",
      description: `Create page "${title}"`,
      collection: "pages",
      slug: uniqueSlug,
      data: toActionData(pageData),
      refresh: builderData.refreshPagesNow,
    });

    if (createdSlug) {
      toast.success(`Created page: ${title}`);
    }

    return createdSlug;
  }

async function duplicatePage(slug: string): Promise<string | null> {
    const fullPage = await fetchPage(slug);
    if (!fullPage) {
      toast.error("Failed to fetch page for duplication");
      return null;
    }

    const baseName = `${fullPage.title || slug} Copy`;
    const existingSlugs = builderData.pages.value.map((p) => p.slug);
    const uniqueSlug = generateUniqueSlug(baseName, existingSlugs);

    const duplicatedData: PageDSL = {
      ...fullPage,
      id: uniqueSlug,
      slug: uniqueSlug,
      title: baseName,
      status: "draft" as const,
      updatedAt: new Date().toISOString(),
    };

    const createdSlug = await recordCreateItem({
      type: "duplicate-page",
      description: `Duplicate page "${fullPage.title || slug}"`,
      collection: "pages",
      slug: uniqueSlug,
      data: toActionData(duplicatedData),
      refresh: builderData.refreshPagesNow,
    });

    if (createdSlug) {
      toast.success(`Duplicated page: ${baseName}`);
    }

    return createdSlug;
  }

async function deletePage(
    slug: string,
    options: StudioDeleteOptions = {},
  ): Promise<boolean> {
    if (slug === HOME_PAGE_SLUG) {
      toast.error("Home page cannot be deleted");
      return false;
    }

    if (builderData.pages.value.some((page) => page.parent === slug)) {
      toast.error("Move or delete child pages before deleting this page");
      return false;
    }

    const fullPage = await fetchPage(slug);
    if (!fullPage) {
      toast.error("Failed to fetch page for deletion");
      return false;
    }

    const pageName = fullPage.title || slug;
    const deleted = await recordDeleteItem({
      type: "delete-page",
      description: `Delete page "${pageName}"`,
      collection: "pages",
      slug,
      restoreData: toActionData(fullPage),
      refresh: builderData.refreshPagesNow,
    });

    if (deleted && !options.silent) {
      toast.success(`Deleted page: ${pageName}`);
    }

    return deleted;
  }

async function deletePagesBatch(
    slugs: string[],
    options: StudioDeleteOptions = {},
  ): Promise<BulkDeleteResult> {
    const uniqueSlugs = [...new Set(slugs)];
    if (uniqueSlugs.length === 0) {
      return { succeeded: 0, failed: 0, errors: [] };
    }

    const plan = resolvePageBatchDeletePlan(
      uniqueSlugs,
      builderData.pages.value,
    );
    const errors = plan.skipped.map(
      (entry) => `${entry.slug}: ${entry.reason}`,
    );

    if (plan.ordered.length === 0) {
      return {
        succeeded: 0,
        failed: uniqueSlugs.length,
        errors,
      };
    }

    const fetchResults = await Promise.all(
      plan.ordered.map(async (slug) => ({
        slug,
        fullPage: await fetchPage(slug),
      })),
    );

    const items = fetchResults.flatMap(({ slug, fullPage }) => {
      if (!fullPage) {
        errors.push(`${slug}: Failed to fetch page for deletion`);
        return [];
      }

      return [{ slug, restoreData: toActionData(fullPage) }];
    });

    if (items.length === 0) {
      return {
        succeeded: 0,
        failed: uniqueSlugs.length,
        errors,
      };
    }

    const description =
      items.length === 1
        ? `Delete page "${items[0]?.slug ?? "page"}"`
        : `Delete ${items.length} pages`;

    const result = await recordDeleteItemsBatch({
      type: "delete-pages-batch",
      description,
      collection: "pages",
      items,
      refresh: builderData.refreshPagesNow,
    });

    if (!options.silent && result.succeeded > 0 && result.failed === 0) {
      toast.success(
        result.succeeded === 1
          ? "Page deleted"
          : `${result.succeeded} pages deleted`,
      );
    }

    return {
      succeeded: result.succeeded,
      failed:
        uniqueSlugs.length - result.succeeded,
      errors: [...errors, ...result.errors],
    };
  }

async function renamePage(
    slug: string,
    newTitle: string,
    newSlug?: string,
  ): Promise<boolean> {
    const parsedInput = RenamePageInputSchema.safeParse({
      slug,
      newTitle,
      newSlug,
    });
    if (!parsedInput.success) {
      toast.error("Invalid page rename input");
      return false;
    }

    const fullPage = await fetchPage(slug);
    if (!fullPage) {
      toast.error("Failed to fetch page for rename");
      return false;
    }

    const oldTitle = fullPage.title || slug;
    const oldSlug = slug;
    const trimmedTitle = newTitle.trim();
    const requestedSlug = newSlug?.trim();
    const targetSlug = requestedSlug ? slugify(requestedSlug) : slug;

    if (requestedSlug && !targetSlug) {
      toast.error("Page slug is invalid");
      return false;
    }

    if (oldSlug === HOME_PAGE_SLUG && targetSlug !== HOME_PAGE_SLUG) {
      toast.error("Home page slug is locked to index");
      return false;
    }

    if (!trimmedTitle) {
      toast.error("Page title cannot be empty");
      return false;
    }

    if (trimmedTitle === oldTitle && targetSlug === oldSlug) {
      return true;
    }

    if (targetSlug !== oldSlug) {
      const existingSlugs = builderData.pages.value.map((p) => p.slug);
      if (existingSlugs.includes(targetSlug)) {
        toast.error("A page with this slug already exists");
        return false;
      }

      if (builderData.pages.value.some((page) => page.parent === oldSlug)) {
        toast.error("Pages with child pages cannot change slug yet");
        return false;
      }
    }

    let createdPageSlug = targetSlug;
    const renamed = await executeStudioOperation(
      {
        type: "rename-page",
        description: `Rename page "${oldTitle}" to "${trimmedTitle}"`,
      },
      {
        redo: async () => {
          if (targetSlug !== oldSlug) {
            const updatedPage = {
              ...fullPage,
              id: targetSlug,
              slug: targetSlug,
              title: trimmedTitle,
              updatedAt: new Date().toISOString(),
            };

            const createResult = unwrapStudioCrudActionResult(
              "create",
              await actions.createItem({
                collection: "pages",
                slug: targetSlug,
                data: toActionData(updatedPage),
              }),
              {
                collection: "pages",
                slug: targetSlug,
                source: "useStudioActions.renamePage.redo.create",
              },
            );

            if (!createResult.success) {
              throw new Error(createResult.error);
            }

            createdPageSlug = createResult.slug ?? targetSlug;

            const deleteResult = unwrapStudioCrudActionResult(
              "delete",
              await actions.deleteItem({
                collection: "pages",
                slug: oldSlug,
              }),
              {
                collection: "pages",
                slug: oldSlug,
                source: "useStudioActions.renamePage.redo.delete",
              },
            );

            if (!deleteResult.success) {
              log(
                "warn",
                "[Studio] Created new page but failed to delete old one",
                {
                  oldSlug,
                  targetSlug: createdPageSlug,
                  error: deleteResult.error,
                },
              );
            }
          } else {
            const updatedPage = {
              ...fullPage,
              title: trimmedTitle,
              updatedAt: new Date().toISOString(),
            };

            const updateResult = unwrapStudioCrudActionResult(
              "update",
              await actions.updateItem({
                collection: "pages",
                slug,
                data: toActionData(updatedPage),
              }),
              {
                collection: "pages",
                slug,
                source: "useStudioActions.renamePage.redo.update",
              },
            );

            if (!updateResult.success) {
              throw new Error(updateResult.error);
            }
          }
          await builderData.refreshPagesNow();
        },
        undo: async () => {
          if (targetSlug !== oldSlug) {
            const restoredPage = {
              ...fullPage,
              title: oldTitle,
              updatedAt: new Date().toISOString(),
            };

            const createResult = unwrapStudioCrudActionResult(
              "create",
              await actions.createItem({
                collection: "pages",
                slug: oldSlug,
                data: toActionData(restoredPage),
              }),
              {
                collection: "pages",
                slug: oldSlug,
                source: "useStudioActions.renamePage.undo.create",
              },
            );

            if (!createResult.success) {
              throw new Error(createResult.error);
            }

            const deleteResult = unwrapStudioCrudActionResult(
              "delete",
              await actions.deleteItem({
                collection: "pages",
                slug: createdPageSlug,
              }),
              {
                collection: "pages",
                slug: createdPageSlug,
                source: "useStudioActions.renamePage.undo.delete",
              },
            );

            if (!deleteResult.success) {
              throw new Error(deleteResult.error);
            }
          } else {
            const restoredPage = {
              ...fullPage,
              title: oldTitle,
              updatedAt: new Date().toISOString(),
            };

            const updateResult = unwrapStudioCrudActionResult(
              "update",
              await actions.updateItem({
                collection: "pages",
                slug,
                data: toActionData(restoredPage),
              }),
              {
                collection: "pages",
                slug,
                source: "useStudioActions.renamePage.undo.update",
              },
            );

            if (!updateResult.success) {
              throw new Error(updateResult.error);
            }
          }
          await builderData.refreshPagesNow();
        },
      },
    );

    if (renamed) {
      toast.success(`Renamed to "${trimmedTitle}"`);
      if (targetSlug !== oldSlug && hasCapability("manageRedirects")) {
        offerRedirectAfterSlugChange({
          pages: builderData.pages.value.map((page) => ({
            slug: page.slug,
            parent: page.parent,
          })),
          oldSlug,
          newSlug: targetSlug,
          pageTitle: trimmedTitle,
        });
      }
    }

    return renamed;
  }

  function isLoadingPage(): boolean {
    return isItemLoading.value === true;
  }

  return {
    loadPageForEditing,
    createPage,
    renamePage,
    duplicatePage,
    deletePage,
    deletePagesBatch,
    isLoadingPage,
  };
}
