import { getStorageAdapterAsync } from "../../../../../../lib/storage/getStorageAdapter";
import {
  buildDiscoveryArtifacts,
  buildDiscoveryReport,
  buildGeneratedDiscoveryBaseline,
  loadDiscoveryContext,
  sanitizeDiscoveryReportForReader,
} from "../../../../../../lib/crawl";
import { listRedirectsFromAdapter } from "../../../../../../lib/redirects/storage";
import { resolveEffectiveCapabilities } from "../../../../../../lib/auth/types";
import { resolveUserPermissionProfile } from "../../../../../../lib/authorship/permissionProfile";
import { requireOperation } from "../../../../../../actions/_shared";
import {
  AriaGetDiscoveryArtifactsInputSchema,
  AriaGetDiscoveryBaselineInputSchema,
  AriaGetDiscoveryReportInputSchema,
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

export async function ariaGetDiscoveryReport(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const parsed = AriaGetDiscoveryReportInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsed.error.issues),
    );
  }
  try {
    const actionContext = toToolActionContext(context);
    const user = await requireOperation(actionContext, "discovery.getReport");
    const adapter = await getStorageAdapterAsync(actionContext.locals);
    const { siteSettings, pages } = await loadDiscoveryContext(adapter);
    const redirects = await listRedirectsFromAdapter(adapter, {
      includeDisabled: false,
    });
    const report = buildDiscoveryReport({ siteSettings, pages, redirects });
    const effective = resolveEffectiveCapabilities(
      resolveUserPermissionProfile(user),
    );
    return toolSuccessResult(
      (effective.includes("editDiscoverySettings")
        ? report
        : sanitizeDiscoveryReportForReader(user, report)) as Record<
        string,
        unknown
      >,
    );
  } catch (error) {
    return toolErrorResult(mapActionErrorToToolError(error));
  }
}

export async function ariaGetDiscoveryArtifacts(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const parsed = AriaGetDiscoveryArtifactsInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsed.error.issues),
    );
  }
  try {
    const actionContext = toToolActionContext(context);
    await requireOperation(actionContext, "discovery.getArtifacts");
    const adapter = await getStorageAdapterAsync(actionContext.locals);
    const { siteSettings, pages, cmsEntries } =
      await loadDiscoveryContext(adapter);
    return toolSuccessResult(
      buildDiscoveryArtifacts({ siteSettings, pages, cmsEntries }) as Record<
        string,
        unknown
      >,
    );
  } catch (error) {
    return toolErrorResult(mapActionErrorToToolError(error));
  }
}

export async function ariaGetDiscoveryBaseline(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const parsed = AriaGetDiscoveryBaselineInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsed.error.issues),
    );
  }
  try {
    const actionContext = toToolActionContext(context);
    await requireOperation(actionContext, "discovery.getGeneratedBaseline");
    const adapter = await getStorageAdapterAsync(actionContext.locals);
    const { siteSettings, pages } = await loadDiscoveryContext(adapter);
    return toolSuccessResult({
      artifact: parsed.data.artifact,
      content: buildGeneratedDiscoveryBaseline({
        artifact: parsed.data.artifact,
        siteSettings,
        pages,
        forEditorSeed: true,
      }),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return toolErrorResult(mapActionErrorToToolError(error));
  }
}
