import { getAdapter } from "../../../../../../actions/_shared";
import {
  buildPageSnapshotAdminUrl,
  resolvePagePreviewStage,
} from "../../../../../../lib/rendering/pageSnapshots";
import { buildPageThumbnailAdminUrlWhenStored } from "../../../../../../lib/rendering/pageThumbnails";
import {
  buildThumbnailFingerprint,
  buildThumbnailState,
} from "../../../../../../lib/rendering/thumbnailArtifacts";
import { getSiteStyleRevision } from "../../../../../../lib/storage/adapter";
import type { AgentToolResult } from "../../schemas";
import { mapActionErrorToToolError, toolErrorResult } from "../toolErrors";
import type { AgentToolActionContext } from "../types";
import { toToolActionContext } from "../toolActionContext";

export async function fetchPageInventoryForTools(
  context: AgentToolActionContext,
): Promise<AgentToolResult<{ pages: unknown[] }>> {
  try {
    const adapter = await getAdapter(toToolActionContext(context));
    const [inventory, siteSettings, storedThumbnailKeys] = await Promise.all([
      adapter.listPagesDSL(),
      adapter.getSiteSettings(),
      adapter.listStoredPageThumbnailKeys(),
    ]);
    const styleRevision = getSiteStyleRevision(siteSettings);

    return {
      ok: true,
      data: {
        pages: (inventory ?? []).map((page) => ({
          ...page,
          systemRole: page.systemRole ?? "standard",
          accessMode: page.accessMode ?? "public",
          hasPassword: page.hasPassword ?? false,
          isModifiedSincePublish: page.isModifiedSincePublish ?? false,
          authorship: page.authorship,
          snapshotUrl: buildPageSnapshotAdminUrl(
            page.slug ?? page.id,
            resolvePagePreviewStage(page),
            page.updatedAt,
            styleRevision,
          ),
          ...(() => {
            const stage = resolvePagePreviewStage(page);
            const thumbnailUrl = buildPageThumbnailAdminUrlWhenStored(
              storedThumbnailKeys,
              page.id,
              stage,
              page.updatedAt,
              styleRevision,
            );
            return {
              thumbnailUrl,
              thumbnail: buildThumbnailState({
                url: thumbnailUrl,
                stage,
                fingerprint: buildThumbnailFingerprint({
                  kind: "page",
                  targetId: page.id,
                  stage,
                  sourceVersion:
                    "version" in page && typeof page.version === "string"
                      ? page.version
                      : null,
                  updatedAt: page.updatedAt,
                  styleRevision,
                  capturePreset: "page-grid-desktop-16x9",
                }),
                updatedAt: page.updatedAt,
              }),
            };
          })(),
        })),
      },
    };
  } catch (error) {
    return toolErrorResult(mapActionErrorToToolError(error));
  }
}
