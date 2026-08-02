import { z } from "zod";
import { hasEffectiveCapability } from "../../../../../../lib/auth";
import { publishing } from "../../../../../../actions/publishing";
import {
  AriaPublishPageInputSchema,
  AriaPublishPageOutputSchema,
  AriaPageSlugInputSchema,
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

/**
 * `aria_publish_page` — Publish a page to production. Reads the current
 * saved draft and promotes that exact revision.
 */
export async function ariaPublishPage(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<z.infer<typeof AriaPublishPageOutputSchema>>> {
  if (context.user && !hasEffectiveCapability(context.user, "publishContent")) {
    return toolErrorResult({
      code: "FORBIDDEN",
      message: "Your role cannot publish pages.",
      suggestedFix:
        "Ask an administrator with the 'Publish content' capability.",
    });
  }

  const parsed = AriaPublishPageInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid publish input", parsed.error.issues),
    );
  }

  const read = await readResourceForTool(context, {
    collection: "pages",
    slug: parsed.data.slug,
    target: "draft",
  });
  if (!read.ok) return read;

  const page = read.data as unknown as Record<string, unknown>;
  const expectedVersion = page.version;
  if (
    typeof expectedVersion !== "string" ||
    expectedVersion.trim().length === 0
  ) {
    return toolErrorResult({
      code: "CONFLICT",
      message: "The page has no saved draft revision to publish.",
      suggestedFix: "Save the page draft, then publish it again.",
    });
  }

  const actionContext = toToolActionContext(context);

  return invokeActionHandlerForTool({
    context,
    operationId: "publishing.publish",
    inputSchema: AriaPublishPageInputSchema,
    outputSchema: AriaPublishPageOutputSchema,
    payload: parsed.data,
    handler: async () =>
      callDefinedAction(publishing.publish, actionContext, {
        id: String(page.id ?? parsed.data.slug),
        expectedVersion,
        skipCSSRegeneration: parsed.data.skipCSSRegeneration,
        scheduledFor: parsed.data.scheduledFor,
      }),
  });
}

function denyPublish(
  context: AgentToolActionContext,
): AgentToolResult<never> | null {
  if (context.user && !hasEffectiveCapability(context.user, "publishContent")) {
    return toolErrorResult({
      code: "FORBIDDEN",
      message: "Your role cannot change page publish state.",
      suggestedFix:
        "Ask an administrator with the 'Publish content' capability.",
    });
  }
  return null;
}

async function runPageLifecycleAction(
  context: AgentToolActionContext,
  input: unknown,
  operationId:
    | "publishing.unpublish"
    | "publishing.archive"
    | "publishing.unarchive",
  handler: (
    payload: { id: string; slug: string },
    ctx: unknown,
  ) => Promise<unknown>,
): Promise<AgentToolResult<{ slug: string; success: true }>> {
  const denied = denyPublish(context);
  if (denied) return denied;

  const parsed = AriaPageSlugInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid page input", parsed.error.issues),
    );
  }

  const read = await readResourceForTool(context, {
    collection: "pages",
    slug: parsed.data.slug,
    target: "draft",
  });
  if (!read.ok) return read;

  const page = read.data as unknown as Record<string, unknown>;
  const actionContext = toToolActionContext(context);

  return invokeActionHandlerForTool({
    context,
    operationId,
    inputSchema: AriaPageSlugInputSchema,
    outputSchema: WriteSuccessSchema,
    payload: parsed.data,
    handler: async () =>
      handler(
        {
          id: String(page.id ?? parsed.data.slug),
          slug: parsed.data.slug,
        },
        actionContext,
      ),
  }) as Promise<AgentToolResult<{ slug: string; success: true }>>;
}

export async function ariaUnpublishPage(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<{ slug: string; success: true }>> {
  return runPageLifecycleAction(
    context,
    input,
    "publishing.unpublish",
    (payload, ctx) =>
      callDefinedAction(publishing.unpublish, ctx as ActionAPIContext, payload),
  );
}

export async function ariaArchivePage(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<{ slug: string; success: true }>> {
  return runPageLifecycleAction(
    context,
    input,
    "publishing.archive",
    (payload, ctx) =>
      callDefinedAction(publishing.archive, ctx as ActionAPIContext, payload),
  );
}

export async function ariaUnarchivePage(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<{ slug: string; success: true }>> {
  return runPageLifecycleAction(
    context,
    input,
    "publishing.unarchive",
    (payload, ctx) =>
      callDefinedAction(publishing.unarchive, ctx as ActionAPIContext, payload),
  );
}
