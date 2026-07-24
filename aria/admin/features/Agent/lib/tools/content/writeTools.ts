import { z } from "zod";
import {
  handleCreateItem,
  handleDeleteItem,
  handleDuplicateItem,
  handleUpdateItem,
} from "../../../../../../actions/crud";
import { slugify } from "@/lib/utils/slugify";
import type {
  ComponentDSL,
  LayoutDSL,
  PageDSL,
} from "../../../../../../lib/types/nodes";
import { hasEffectiveCapability } from "../../../../../../lib/auth";
import {
  AriaCreatePageInputSchema,
  AriaCreatePageOutputSchema,
  AriaCreateLayoutInputSchema,
  AriaCreateComponentInputSchema,
  AriaDuplicateDocumentInputSchema,
  AriaDuplicateDocumentOutputSchema,
  AriaDeleteDocumentInputSchema,
  AriaSaveDocumentInputSchema,
  AriaUpdatePageMetaInputSchema,
  WriteSuccessSchema,
  type AgentToolResult,
} from "../../schemas";
import { invokeActionHandlerForTool } from "../invokeActionHandlerForTool";
import { toolErrorFromZod, toolErrorResult } from "../toolErrors";
import type { AgentToolActionContext } from "../types";
import { toToolActionContext } from "../toolActionContext";
import { fetchPageInventoryForTools } from "./pageInventoryForTools";
import { readResourceForTool } from "./readResource";
import { denyUtilityClassesWhenDisabled } from "./utilityClassPolicy";

const HOME_PAGE_SLUG = "index";
const EmptyInputSchema = z.object({}).strict();
const CrudSuccessSchema = z.object({
  success: z.literal(true),
  slug: z.string().optional(),
});

function denyPageWrites(
  context: AgentToolActionContext,
): AgentToolResult<never> | null {
  if (context.user && !hasEffectiveCapability(context.user, "editPages")) {
    return toolErrorResult({
      code: "FORBIDDEN",
      message: "Your role cannot update page metadata.",
      suggestedFix: "Ask an administrator with page edit access.",
    });
  }
  return null;
}

function mergePageMeta(
  page: PageDSL,
  input: {
    title?: string;
    layout?: string;
    status?: "draft" | "published" | "archived";
    seoTitle?: string;
    seoDescription?: string;
  },
): PageDSL {
  const next: PageDSL = { ...page };

  if (input.title !== undefined) {
    next.title = input.title;
  }
  if (input.layout !== undefined) {
    next.layout = input.layout;
  }
  if (input.status !== undefined) {
    next.status = input.status;
  }
  if (input.seoTitle !== undefined || input.seoDescription !== undefined) {
    next.settings = {
      ...next.settings,
      seo: {
        ...next.settings?.seo,
        ...(input.seoTitle !== undefined ? { title: input.seoTitle } : {}),
        ...(input.seoDescription !== undefined
          ? { description: input.seoDescription }
          : {}),
      },
    };
  }

  return next;
}

async function renamePageSlug(
  context: AgentToolActionContext,
  page: PageDSL,
  oldSlug: string,
  targetSlug: string,
  title: string,
): Promise<
  AgentToolResult<{ slug: string; title: string; previousSlug: string }>
> {
  if (oldSlug === HOME_PAGE_SLUG && targetSlug !== HOME_PAGE_SLUG) {
    return toolErrorResult({
      code: "INVALID_INPUT",
      message: "Home page slug is locked to index.",
      suggestedFix: "Choose a different page or keep slug as index.",
    });
  }

  const inventory = await fetchPageInventoryForTools(context);
  if (!inventory.ok) {
    return inventory;
  }

  const pages = inventory.data.pages as Array<{
    slug?: string;
    parent?: string;
  }>;

  const existingSlugs = pages
    .map((entry) => entry.slug)
    .filter((value): value is string => Boolean(value));

  if (existingSlugs.includes(targetSlug)) {
    return toolErrorResult({
      code: "INVALID_INPUT",
      message: `A page with slug "${targetSlug}" already exists.`,
      suggestedFix: "Pick a unique slug.",
    });
  }

  if (pages.some((entry) => entry.parent === oldSlug)) {
    return toolErrorResult({
      code: "INVALID_INPUT",
      message: "Pages with child pages cannot change slug yet.",
      suggestedFix: "Reparent or remove child pages first.",
    });
  }

  const updatedPage: PageDSL = {
    ...page,
    id: targetSlug,
    slug: targetSlug,
    title,
    updatedAt: new Date().toISOString(),
  };

  const actionContext = toToolActionContext(context);

  const createResult = await invokeActionHandlerForTool({
    context,
    operationId: "crud.createItem",
    inputSchema: EmptyInputSchema,
    outputSchema: CrudSuccessSchema,
    payload: {},
    handler: async () =>
      handleCreateItem(
        {
          collection: "pages",
          slug: targetSlug,
          data: updatedPage as unknown as Record<string, unknown>,
        },
        actionContext,
      ),
  });

  if (!createResult.ok) {
    return createResult;
  }

  const deleteResult = await invokeActionHandlerForTool({
    context,
    operationId: "crud.deleteItem",
    inputSchema: EmptyInputSchema,
    outputSchema: CrudSuccessSchema,
    payload: {},
    handler: async () =>
      handleDeleteItem({ collection: "pages", slug: oldSlug }, actionContext),
  });

  if (!deleteResult.ok) {
    return deleteResult;
  }

  return {
    ok: true,
    data: {
      slug: targetSlug,
      title,
      previousSlug: oldSlug,
    },
  };
}

export async function ariaUpdatePageMeta(
  context: AgentToolActionContext,
  input: unknown,
): Promise<
  AgentToolResult<{
    slug: string;
    title: string;
    previousSlug?: string;
    redirectNote?: string;
  }>
> {
  const denied = denyPageWrites(context);
  if (denied) {
    return denied;
  }

  const parsed = AriaUpdatePageMetaInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsed.error.issues),
    );
  }

  const read = await readResourceForTool(context, {
    collection: "pages",
    slug: parsed.data.slug,
    target: "draft",
  });
  if (!read.ok) {
    return read;
  }

  const page = read.data as PageDSL;
  const requestedSlug = parsed.data.newSlug?.trim();
  const targetSlug = requestedSlug ? slugify(requestedSlug) : page.slug;

  if (requestedSlug && !targetSlug) {
    return toolErrorResult({
      code: "INVALID_INPUT",
      message: "Page slug is invalid.",
      suggestedFix: "Use lowercase letters, numbers, and hyphens.",
    });
  }

  const nextTitle = parsed.data.title?.trim() ?? page.title;
  if (!nextTitle) {
    return toolErrorResult({
      code: "INVALID_INPUT",
      message: "Page title cannot be empty.",
    });
  }

  if (targetSlug !== page.slug) {
    return renamePageSlug(context, page, page.slug, targetSlug, nextTitle);
  }

  const merged = mergePageMeta(page, parsed.data);
  merged.title = nextTitle;

  const actionContext = toToolActionContext(context);

  const updateResult = await invokeActionHandlerForTool({
    context,
    operationId: "crud.updateItem",
    inputSchema: AriaUpdatePageMetaInputSchema,
    outputSchema: CrudSuccessSchema,
    payload: parsed.data,
    handler: async () =>
      handleUpdateItem(
        {
          collection: "pages",
          slug: page.slug,
          data: merged as unknown as Record<string, unknown>,
        },
        actionContext,
      ),
  });

  if (!updateResult.ok) {
    return updateResult;
  }

  return {
    ok: true,
    data: {
      slug: page.slug,
      title: nextTitle,
    },
  };
}

export async function ariaCreatePage(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<{ slug: string; title: string }>> {
  const denied = denyPageWrites(context);
  if (denied) return denied;

  const parsed = AriaCreatePageInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsed.error.issues),
    );
  }

  const slug = parsed.data.slug ?? slugify(parsed.data.title);

  const newPage: PageDSL = {
    id: slug,
    slug,
    title: parsed.data.title,
    status: "draft",
    nodes: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as PageDSL;

  const actionContext = toToolActionContext(context);

  return invokeActionHandlerForTool({
    context,
    operationId: "crud.createItem",
    inputSchema: AriaCreatePageInputSchema,
    outputSchema: AriaCreatePageOutputSchema,
    payload: parsed.data,
    handler: async () =>
      handleCreateItem(
        {
          collection: "pages",
          slug,
          data: newPage as unknown as Record<string, unknown>,
        },
        actionContext,
      ),
  });
}

export async function ariaSaveDocument(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<{ success: true }>> {
  const denied = denyPageWrites(context);
  if (denied) return denied;

  const parsed = AriaSaveDocumentInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsed.error.issues),
    );
  }

  if (parsed.data.nodes !== undefined) {
    const utilityClassesDenied = await denyUtilityClassesWhenDisabled(
      context,
      parsed.data.nodes,
    );
    if (utilityClassesDenied) return utilityClassesDenied;
  }

  const actionContext = toToolActionContext(context);

  const read = await readResourceForTool(context, {
    collection: parsed.data.collection,
    slug: parsed.data.slug,
    target: "draft",
  });
  if (!read.ok) return read;

  const existing = read.data as unknown as Record<string, unknown>;

  if (parsed.data.title !== undefined) {
    existing.title = parsed.data.title;
  }
  if (parsed.data.nodes !== undefined) {
    existing.nodes = parsed.data.nodes;
  }
  existing.updatedAt = new Date().toISOString();

  return invokeActionHandlerForTool({
    context,
    operationId: "crud.updateItem",
    inputSchema: AriaSaveDocumentInputSchema,
    outputSchema: WriteSuccessSchema,
    payload: parsed.data,
    handler: async () =>
      handleUpdateItem(
        {
          collection: parsed.data.collection,
          slug: parsed.data.slug,
          data: existing as unknown as Record<string, unknown>,
        },
        actionContext,
      ),
  });
}

export async function ariaDeleteDocument(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<{ success: true }>> {
  const denied = denyPageWrites(context);
  if (denied) return denied;

  const parsed = AriaDeleteDocumentInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsed.error.issues),
    );
  }

  const actionContext = toToolActionContext(context);

  return invokeActionHandlerForTool({
    context,
    operationId: "crud.deleteItem",
    inputSchema: AriaDeleteDocumentInputSchema,
    outputSchema: WriteSuccessSchema,
    payload: parsed.data,
    handler: async () =>
      handleDeleteItem(
        {
          collection: parsed.data.collection,
          slug: parsed.data.slug,
        },
        actionContext,
      ),
  });
}

export async function ariaCreateLayout(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<{ slug: string; title: string }>> {
  const denied = denyPageWrites(context);
  if (denied) return denied;

  const parsed = AriaCreateLayoutInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsed.error.issues),
    );
  }

  const slug = parsed.data.slug ?? slugify(parsed.data.name);
  const layoutData: LayoutDSL = {
    id: slug,
    name: parsed.data.name,
    description: parsed.data.description ?? "",
    nodes: [],
    slots: [],
    metadata: {},
    layoutMetadata: {},
    settings: {},
    updatedAt: new Date().toISOString(),
  } as LayoutDSL;

  const actionContext = toToolActionContext(context);

  return invokeActionHandlerForTool({
    context,
    operationId: "crud.createItem",
    inputSchema: AriaCreateLayoutInputSchema,
    outputSchema: AriaCreatePageOutputSchema,
    payload: parsed.data,
    handler: async () =>
      handleCreateItem(
        {
          collection: "layouts",
          slug,
          data: layoutData as unknown as Record<string, unknown>,
        },
        actionContext,
      ).then(() => ({ slug, title: parsed.data.name })),
  });
}

export async function ariaCreateComponent(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<{ slug: string; title: string }>> {
  const denied = denyPageWrites(context);
  if (denied) return denied;

  const parsed = AriaCreateComponentInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsed.error.issues),
    );
  }

  const slug = parsed.data.slug ?? slugify(parsed.data.name);
  const componentData: ComponentDSL = {
    id: slug,
    name: parsed.data.name,
    description: parsed.data.description ?? "",
    category: parsed.data.category ?? "",
    nodes: [],
    settings: {},
    updatedAt: new Date().toISOString(),
  } as ComponentDSL;

  const actionContext = toToolActionContext(context);

  return invokeActionHandlerForTool({
    context,
    operationId: "crud.createItem",
    inputSchema: AriaCreateComponentInputSchema,
    outputSchema: AriaCreatePageOutputSchema,
    payload: parsed.data,
    handler: async () =>
      handleCreateItem(
        {
          collection: "components",
          slug,
          data: componentData as unknown as Record<string, unknown>,
        },
        actionContext,
      ).then(() => ({ slug, title: parsed.data.name })),
  });
}

export async function ariaDuplicateDocument(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<{ slug: string }>> {
  const denied = denyPageWrites(context);
  if (denied) return denied;

  const parsed = AriaDuplicateDocumentInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsed.error.issues),
    );
  }

  const actionContext = toToolActionContext(context);

  return invokeActionHandlerForTool({
    context,
    operationId: "crud.duplicateItem",
    inputSchema: AriaDuplicateDocumentInputSchema,
    outputSchema: AriaDuplicateDocumentOutputSchema,
    payload: parsed.data,
    handler: async () => {
      const result = await handleDuplicateItem(
        {
          collection: parsed.data.collection,
          sourceSlug: parsed.data.sourceSlug,
          newSlug: parsed.data.newSlug,
        },
        actionContext,
      );
      return { slug: result.slug };
    },
  });
}
