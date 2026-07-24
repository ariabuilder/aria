import { getAdapter } from "../../../../../../actions/_shared";
import {
  AriaGetPageVersionInputSchema,
  AriaListPageVersionsInputSchema,
  type AgentToolResult,
} from "../../schemas";
import {
  mapActionErrorToToolError,
  toolErrorFromZod,
  toolErrorResult,
  toolSuccessResult,
} from "../toolErrors";
import { toToolActionContext } from "../toolActionContext";
import type { AgentToolActionContext } from "../types";

export async function ariaListPageVersions(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const parsed = AriaListPageVersionsInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsed.error.issues),
    );
  }
  try {
    const adapter = await getAdapter(toToolActionContext(context));
    const page = await adapter.getPageDSL(parsed.data.slug);
    if (!page) {
      return toolErrorResult({
        code: "NOT_FOUND",
        message: `Page not found: ${parsed.data.slug}`,
      });
    }
    const versions = await adapter.getPageVersions(page.id);
    const sorted = [...versions].sort((left, right) =>
      right.version.localeCompare(left.version),
    );
    return toolSuccessResult({
      pageId: page.id,
      slug: page.slug,
      currentVersion: page.version,
      versions: sorted.map((version) => ({
        version: version.version,
        createdAt: version.createdAt,
        createdBy: version.createdBy,
        activity: version.activity ?? null,
      })),
    });
  } catch (error) {
    return toolErrorResult(mapActionErrorToToolError(error));
  }
}

export async function ariaGetPageVersion(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const parsed = AriaGetPageVersionInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsed.error.issues),
    );
  }
  try {
    const adapter = await getAdapter(toToolActionContext(context));
    const page = await adapter.getPageDSL(parsed.data.slug);
    if (!page) {
      return toolErrorResult({
        code: "NOT_FOUND",
        message: `Page not found: ${parsed.data.slug}`,
      });
    }
    const snapshot = await adapter.getPageDSL(page.id, parsed.data.versionId);
    if (!snapshot) {
      return toolErrorResult({
        code: "NOT_FOUND",
        message: `Page version not found: ${parsed.data.versionId}`,
      });
    }
    return toolSuccessResult({
      slug: parsed.data.slug,
      version: parsed.data.versionId,
      snapshot,
    });
  } catch (error) {
    return toolErrorResult(mapActionErrorToToolError(error));
  }
}
