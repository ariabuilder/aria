import { ref } from "vue";
import { z } from "zod";
import { useBuilderData } from "@/composables/useBuilderData";
import { slugify } from "@/lib/utils/slugify";
import type {
  ComponentDSL,
  JsonObject,
  LayoutDSL,
  PageDSL,
} from "@/lib/types/nodes";
import {
  JsonObjectSchema,
  PageDSLSchema,
  LayoutDSLSchema,
  ComponentDSLSchema,
} from "@/lib/schemas/nodes";
import { useStudioCrudHistory } from "./useStudioCrudHistory";
import { useStudioCapabilities } from "@/composables/useStudioCapabilities";

export const HOME_PAGE_SLUG = "index";

export interface CreatePageOptions {
  title?: string;
  slug?: string;
  parent?: string | null;
  layout?: string;
}

export interface CreateComponentOptions {
  name?: string;
  slug?: string;
  description?: string;
  category?: string;
}

export interface BulkDeleteResult {
  succeeded: number;
  failed: number;
  errors: string[];
}

export interface StudioDeleteOptions {
  silent?: boolean;
}

export interface StudioActionsReturn {
  loadPageForEditing: (slug: string) => Promise<void>;
  createPage: (options?: CreatePageOptions) => Promise<string | null>;
  renamePage: (
    slug: string,
    newTitle: string,
    newSlug?: string,
  ) => Promise<boolean>;
  duplicatePage: (slug: string) => Promise<string | null>;
  deletePage: (slug: string, options?: StudioDeleteOptions) => Promise<boolean>;
  deletePagesBatch: (
    slugs: string[],
    options?: StudioDeleteOptions,
  ) => Promise<BulkDeleteResult>;

  loadLayoutForEditing: (slug: string) => Promise<void>;
  createLayout: (name?: string) => Promise<string | null>;
  renameLayout: (slug: string, newName: string) => Promise<boolean>;
  duplicateLayout: (slug: string) => Promise<string | null>;
  deleteLayout: (slug: string) => Promise<boolean>;

  loadComponentForEditing: (id: string) => Promise<void>;
  createComponent: (options?: CreateComponentOptions) => Promise<string | null>;
  renameComponent: (id: string, newName: string) => Promise<boolean>;
  duplicateComponent: (id: string) => Promise<string | null>;
  deleteComponent: (id: string, options?: StudioDeleteOptions) => Promise<boolean>;
  deleteComponentsBatch: (
    ids: string[],
    options?: StudioDeleteOptions,
  ) => Promise<BulkDeleteResult>;

  isLoadingPage: () => boolean;
  isLoadingLayout: () => boolean;
  isLoadingComponent: () => boolean;
}

export const SlugSchema = z.string().trim().min(1);

export const CreatePageOptionsSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    slug: z.string().trim().min(1).optional(),
    parent: z.string().trim().min(1).nullable().optional(),
    layout: z.string().optional(),
  })
  .strict();

export const RenamePageInputSchema = z
  .object({
    slug: z.string().trim().min(1),
    newTitle: z.string().trim().min(1),
    newSlug: z.string().trim().min(1).optional(),
  })
  .strict();

export const RenameLayoutInputSchema = z
  .object({
    slug: z.string().trim().min(1),
    newName: z.string().trim().min(1),
  })
  .strict();

export const CreateLayoutInputSchema = z.string().trim().min(1);

export const CreateComponentOptionsSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    slug: z.string().trim().min(1).optional(),
    description: z.string().trim().optional(),
    category: z.string().trim().optional(),
  })
  .strict();

export const RenameComponentInputSchema = z
  .object({
    id: z.string().trim().min(1),
    newName: z.string().trim().min(1),
  })
  .strict();

export interface StudioCrudContext {
  builderData: ReturnType<typeof useBuilderData>;
  canCreatePage: ReturnType<typeof useStudioCapabilities>["canCreatePage"];
  getForbiddenMessage: ReturnType<
    typeof useStudioCapabilities
  >["getForbiddenMessage"];
  executeStudioOperation: ReturnType<
    typeof useStudioCrudHistory
  >["executeStudioOperation"];
  recordCreateItem: ReturnType<typeof useStudioCrudHistory>["recordCreateItem"];
  recordDeleteItem: ReturnType<typeof useStudioCrudHistory>["recordDeleteItem"];
  recordDeleteItemsBatch: ReturnType<
    typeof useStudioCrudHistory
  >["recordDeleteItemsBatch"];
  recordUpdateItem: ReturnType<typeof useStudioCrudHistory>["recordUpdateItem"];
  isItemLoading: ReturnType<typeof ref<boolean>>;
  generateUniqueSlug: (baseName: string, existingSlugs: string[]) => string;
  toActionData: (data: PageDSL | LayoutDSL | ComponentDSL) => JsonObject;
}

export function createStudioCrudContext(): StudioCrudContext {
  const builderData = useBuilderData();
  const { canCreatePage, getForbiddenMessage } = useStudioCapabilities();
  const {
    executeStudioOperation,
    recordCreateItem,
    recordDeleteItem,
    recordDeleteItemsBatch,
    recordUpdateItem,
  } = useStudioCrudHistory();
  const isItemLoading = ref(false);

  function generateUniqueSlug(
    baseName: string,
    existingSlugs: string[],
  ): string {
    const baseSlug = slugify(baseName);
    let uniqueSlug = baseSlug;
    let counter = 1;
    while (existingSlugs.includes(uniqueSlug)) {
      uniqueSlug = `${baseSlug}-${counter}`;
      counter++;
    }
    return uniqueSlug;
  }

  function dslPayloadForStorage(
    payload: PageDSL | LayoutDSL | ComponentDSL,
  ): JsonObject {
    return JsonObjectSchema.parse(JSON.parse(JSON.stringify(payload)));
  }

  function toActionData(data: PageDSL | LayoutDSL | ComponentDSL): JsonObject {
    const pageParsed = PageDSLSchema.safeParse(data);
    if (pageParsed.success) {
      return dslPayloadForStorage(pageParsed.data);
    }

    const layoutParsed = LayoutDSLSchema.safeParse(data);
    if (layoutParsed.success) {
      return dslPayloadForStorage(layoutParsed.data);
    }

    const componentParsed = ComponentDSLSchema.safeParse(data);
    if (componentParsed.success) {
      return dslPayloadForStorage(componentParsed.data);
    }

    throw new Error("Invalid DSL payload for action");
  }

  return {
    builderData,
    canCreatePage,
    getForbiddenMessage,
    executeStudioOperation,
    recordCreateItem,
    recordDeleteItem,
    recordDeleteItemsBatch,
    recordUpdateItem,
    isItemLoading,
    generateUniqueSlug,
    toActionData,
  };
}
