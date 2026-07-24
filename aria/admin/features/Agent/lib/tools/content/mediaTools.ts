import { handleListMedia } from "../../../../../../actions/mediaListHandler";
import { handleUpdateItem } from "../../../../../../actions/crud";
import { media } from "../../../../../../actions/media";
import { pages } from "../../../../../../actions/pages";
import { hasEffectiveCapability } from "../../../../../../lib/auth";
import {
  AriaListMediaInputSchema,
  AriaListMediaOutputSchema,
  AriaAttachMediaInputSchema,
  AriaDeleteMediaInputSchema,
  AriaRenameMediaInputSchema,
  AriaDuplicateMediaInputSchema,
  AriaGetMediaUsagesInputSchema,
  AriaSetPageCoverInputSchema,
  AriaImportMediaFromUrlInputSchema,
  WriteSuccessSchema,
  type AgentToolResult,
} from "../../schemas";
import { invokeActionHandlerForTool } from "../invokeActionHandlerForTool";
import { callDefinedAction } from "../callDefinedAction";
import type { ActionAPIContext } from "astro:actions";
import { toolErrorFromZod, toolErrorResult } from "../toolErrors";
import type { AgentToolActionContext } from "../types";
import { toToolActionContext } from "../toolActionContext";
import { readResourceForTool } from "./readResource";

function denyPageWrites(
  context: AgentToolActionContext,
): AgentToolResult<never> | null {
  if (context.user && !hasEffectiveCapability(context.user, "editPages")) {
    return toolErrorResult({
      code: "FORBIDDEN",
      message: "Your role cannot modify page content.",
      suggestedFix: "Ask an administrator with page edit access.",
    });
  }
  return null;
}

export interface MediaItem {
  id: string;
  name: string;
  type: string;
  url: string;
  size?: number;
  mimeType?: string;
}

export function filterMediaItems(
  items: readonly MediaItem[],
  search: string | undefined,
): MediaItem[] {
  const query = search?.trim().toLowerCase();
  if (!query) return [...items];

  return items.filter(
    (item) =>
      item.name.toLowerCase().includes(query) ||
      item.type.toLowerCase().includes(query) ||
      item.url.toLowerCase().includes(query) ||
      item.mimeType?.toLowerCase().includes(query),
  );
}

function toMediaItem(raw: Record<string, unknown>): MediaItem {
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    type: String(raw.type ?? "unknown"),
    url: String(raw.url ?? ""),
    size: typeof raw.size === "number" ? raw.size : undefined,
    mimeType: typeof raw.mimeType === "string" ? raw.mimeType : undefined,
  };
}

export async function ariaListMedia(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<{ items: MediaItem[]; total: number }>> {
  const parsed = AriaListMediaInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsed.error.issues),
    );
  }

  const actionContext = toToolActionContext(context);

  return invokeActionHandlerForTool({
    context,
    operationId: "media.list",
    inputSchema: AriaListMediaInputSchema,
    outputSchema: AriaListMediaOutputSchema,
    payload: parsed.data,
    handler: async () => {
      const raw = await handleListMedia(
        parsed.data.search ? { folder: parsed.data.search } : undefined,
        actionContext,
      );
      const items = (Array.isArray(raw) ? raw : []).map((item: unknown) =>
        toMediaItem(item as Record<string, unknown>),
      );

      const filtered = filterMediaItems(items, parsed.data.search);

      const limit = parsed.data.limit ?? 50;
      const offset = parsed.data.offset ?? 0;
      const paged = filtered.slice(offset, offset + limit);

      return { items: paged, total: filtered.length };
    },
  });
}

export async function ariaAttachMediaToNode(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<{ success: true }>> {
  const denied = denyPageWrites(context);
  if (denied) return denied;

  const parsed = AriaAttachMediaInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsed.error.issues),
    );
  }

  const actionContext = toToolActionContext(context);

  const read = await readResourceForTool(context, {
    collection: parsed.data.collection,
    slug: parsed.data.slug,
    target: "draft",
  });
  if (!read.ok) return read;

  const doc = read.data as unknown as Record<string, unknown>;
  const nodes = doc.nodes as Array<Record<string, unknown>> | undefined;
  if (!nodes) {
    return toolErrorResult({
      code: "NOT_FOUND",
      message: "Document has no nodes.",
    });
  }

  const parsedData = parsed.data!;
  function findAndUpdateNode(tree: Array<Record<string, unknown>>): boolean {
    for (const node of tree) {
      if (node.id === parsedData.nodeId) {
        const props = (node.props as Record<string, unknown>) ?? {};
        props[parsedData.prop] = parsedData.mediaUrl;
        node.props = props;
        return true;
      }
      const children = node.children as
        | Array<Record<string, unknown>>
        | undefined;
      if (children?.length && findAndUpdateNode(children)) {
        return true;
      }
    }
    return false;
  }

  if (!findAndUpdateNode(nodes)) {
    return toolErrorResult({
      code: "NOT_FOUND",
      message: `Node ${parsed.data.nodeId} not found in ${parsed.data.collection} ${parsed.data.slug}.`,
    });
  }

  doc.updatedAt = new Date().toISOString();

  return invokeActionHandlerForTool({
    context,
    operationId: "crud.updateItem",
    inputSchema: AriaAttachMediaInputSchema,
    outputSchema: WriteSuccessSchema,
    payload: parsed.data,
    handler: async () =>
      handleUpdateItem(
        {
          collection: parsed.data.collection,
          slug: parsed.data.slug,
          data: doc as Record<string, unknown>,
        },
        actionContext,
      ),
  });
}

function actionHandler(action: unknown) {
  return (payload: unknown, context: unknown) =>
    callDefinedAction(action, context as ActionAPIContext, payload);
}

export async function ariaGetMediaUsages(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const parsed = AriaGetMediaUsagesInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsed.error.issues),
    );
  }

  const actionContext = toToolActionContext(context);

  return invokeActionHandlerForTool({
    context,
    operationId: "media.usages",
    inputSchema: AriaGetMediaUsagesInputSchema,
    outputSchema: WriteSuccessSchema,
    payload: parsed.data,
    handler: async () =>
      actionHandler(media.usages)(parsed.data, actionContext),
  }) as Promise<AgentToolResult<Record<string, unknown>>>;
}

export async function ariaDeleteMedia(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<{ success: true }>> {
  const denied = denyPageWrites(context);
  if (denied) return denied;

  const parsed = AriaDeleteMediaInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsed.error.issues),
    );
  }

  const actionContext = toToolActionContext(context);

  return invokeActionHandlerForTool({
    context,
    operationId: "media.delete",
    inputSchema: AriaDeleteMediaInputSchema,
    outputSchema: WriteSuccessSchema,
    payload: parsed.data,
    handler: async () =>
      actionHandler(media.delete)(parsed.data, actionContext),
  });
}

export async function ariaRenameMedia(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const denied = denyPageWrites(context);
  if (denied) return denied;

  const parsed = AriaRenameMediaInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsed.error.issues),
    );
  }

  const actionContext = toToolActionContext(context);

  return invokeActionHandlerForTool({
    context,
    operationId: "media.rename",
    inputSchema: AriaRenameMediaInputSchema,
    outputSchema: WriteSuccessSchema,
    payload: parsed.data,
    handler: async () =>
      actionHandler(media.rename)(parsed.data, actionContext),
  }) as Promise<AgentToolResult<Record<string, unknown>>>;
}

export async function ariaDuplicateMedia(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const denied = denyPageWrites(context);
  if (denied) return denied;

  const parsed = AriaDuplicateMediaInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsed.error.issues),
    );
  }

  const actionContext = toToolActionContext(context);

  return invokeActionHandlerForTool({
    context,
    operationId: "media.duplicate",
    inputSchema: AriaDuplicateMediaInputSchema,
    outputSchema: WriteSuccessSchema,
    payload: parsed.data,
    handler: async () =>
      actionHandler(media.duplicate)(parsed.data, actionContext),
  }) as Promise<AgentToolResult<Record<string, unknown>>>;
}

export async function ariaImportMediaFromUrl(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const denied = denyPageWrites(context);
  if (denied) return denied;

  const parsed = AriaImportMediaFromUrlInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsed.error.issues),
    );
  }

  const actionContext = toToolActionContext(context);

  return invokeActionHandlerForTool({
    context,
    operationId: "media.upload",
    inputSchema: AriaImportMediaFromUrlInputSchema,
    outputSchema: WriteSuccessSchema,
    payload: parsed.data,
    handler: async () =>
      actionHandler(media.importFromUrl)(parsed.data, actionContext),
  }) as Promise<AgentToolResult<Record<string, unknown>>>;
}

export async function ariaSetPageCover(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const denied = denyPageWrites(context);
  if (denied) return denied;

  const parsed = AriaSetPageCoverInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsed.error.issues),
    );
  }

  const actionContext = toToolActionContext(context);

  if (parsed.data.remove) {
    return invokeActionHandlerForTool({
      context,
      operationId: "pages.removeCover",
      inputSchema: AriaSetPageCoverInputSchema,
      outputSchema: WriteSuccessSchema,
      payload: parsed.data,
      handler: async () =>
        actionHandler(pages.removeCover)(
          { pageSlug: parsed.data.pageSlug },
          actionContext,
        ),
    }) as Promise<AgentToolResult<Record<string, unknown>>>;
  }

  if (!parsed.data.src) {
    return toolErrorResult({
      code: "INVALID_INPUT",
      message: "Provide src or set remove: true.",
    });
  }

  return invokeActionHandlerForTool({
    context,
    operationId: "pages.cover",
    inputSchema: AriaSetPageCoverInputSchema,
    outputSchema: WriteSuccessSchema,
    payload: parsed.data,
    handler: async () =>
      actionHandler(pages.cover)(
        {
          pageSlug: parsed.data.pageSlug,
          src: parsed.data.src,
          alt: parsed.data.alt,
          caption: parsed.data.caption,
          autoSetOgImage: parsed.data.autoSetOgImage,
        },
        actionContext,
      ),
  }) as Promise<AgentToolResult<Record<string, unknown>>>;
}
