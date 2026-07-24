import { z } from "zod";
import { getAdapter } from "../../../../../../actions/_shared";
import { hasEffectiveCapability } from "../../../../../../lib/auth";
import { resolveAbsoluteSiteUrl } from "../../../../../../lib/pages/publicPaths";
import { handleUpdateItem } from "../../../../../../actions/crud";
import {
  AriaUpdatePageSeoInputSchema,
  AriaUpdatePageSeoOutputSchema,
  type AgentToolResult,
} from "../../schemas";
import { invokeActionHandlerForTool } from "../invokeActionHandlerForTool";
import { toolErrorFromZod, toolErrorResult } from "../toolErrors";
import type { AgentToolActionContext } from "../types";
import { toToolActionContext } from "../toolActionContext";
import { readResourceForTool } from "./readResource";

/**
 * `aria_update_page_seo` — Update page SEO metadata. Accepts any subset of SEO meta fields.
 */
export async function ariaUpdatePageSeo(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<z.infer<typeof AriaUpdatePageSeoOutputSchema>>> {
  if (context.user && !hasEffectiveCapability(context.user, "editPages")) {
    return toolErrorResult({
      code: "FORBIDDEN",
      message: "Your role cannot update page SEO metadata.",
      suggestedFix: "Ask an administrator with page edit access.",
    });
  }

  const parsed = AriaUpdatePageSeoInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid SEO update input", parsed.error.issues),
    );
  }

  const read = await readResourceForTool(context, {
    collection: "pages",
    slug: parsed.data.slug,
    target: "draft",
  });
  if (!read.ok) return read;

  const page = read.data as unknown as Record<string, unknown>;
  const currentSettings = (
    page.settings as Record<string, unknown> | undefined
  ) ?? {};
  const currentSeo = (
    currentSettings.seo as Record<string, unknown> | undefined
  ) ?? {};

  const adapter = await getAdapter(toToolActionContext(context));
  const siteSettings = await adapter.getSiteSettings();
  const siteUrl = siteSettings?.siteUrl;

  const seoPatch: Record<string, unknown> = {};
  const seoFields: Array<keyof z.infer<typeof AriaUpdatePageSeoInputSchema>> = [
    "title", "description", "ogTitle", "ogDescription",
    "ogImage", "canonical", "noindex", "nofollow", "structuredData",
  ];
  for (const field of seoFields) {
    if (parsed.data[field] === undefined) continue;

    let value = parsed.data[field];
    if (field === "canonical" || field === "ogImage") {
      value =
        resolveAbsoluteSiteUrl(siteUrl, value as string) ?? (value as string);
    }
    seoPatch[field] = value;
  }

  page.settings = {
    ...currentSettings,
    seo: { ...currentSeo, ...seoPatch },
  };
  page.updatedAt = new Date().toISOString();

  const actionContext = toToolActionContext(context);

  return invokeActionHandlerForTool({
    context,
    operationId: "crud.updateItem",
    inputSchema: AriaUpdatePageSeoInputSchema,
    outputSchema: AriaUpdatePageSeoOutputSchema,
    payload: parsed.data,
    handler: async () =>
      handleUpdateItem(
        {
          collection: "pages",
          slug: parsed.data.slug,
          data: page as Record<string, unknown>,
        },
        actionContext,
      ),
  });
}
