import type { APIRoute } from "astro";

import { buildComponentSnapshotInput } from "../../../../../aria/actions/_componentSnapshotInput";
import {
  getComponentSnapshotHtml,
  hasCurrentComponentSnapshotVersion,
  prepareComponentSnapshotForThumbnailCapture,
  saveComponentSnapshot,
} from "../../../../../aria/lib/rendering/componentSnapshots";
import { ComponentThumbnailIdSchema } from "../../../../../aria/lib/schemas/componentPreview";
import { getStorageAdapterAsync } from "../../../../../aria/lib/storage/getStorageAdapter";
import { resolveSiteStyleRevision } from "../../../../../aria/lib/storage/adapter";
import { requireAdminApiCapabilities } from "../_auth";

export const GET: APIRoute = async ({ params, locals, cookies, request }) => {
  const componentId = ComponentThumbnailIdSchema.parse(params.id);
  const url = new URL(request.url);
  const shouldRefresh =
    url.searchParams.get("refresh") === "1" ||
    url.searchParams.get("refresh") === "true";
  const isThumbnailRequest =
    url.searchParams.get("thumb") === "1" ||
    url.searchParams.get("thumb") === "true";

  function respondWithSnapshotHtml(html: string): Response {
    const body = isThumbnailRequest
      ? prepareComponentSnapshotForThumbnailCapture(html)
      : html;

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, max-age=600, stale-while-revalidate=86400",
      },
    });
  }

  const auth = await requireAdminApiCapabilities({
    locals,
    cookies,
    anyOf: ["editPageContent", "editPageStructure", "editPages"],
  });
  if (!auth.ok) {
    return auth.response;
  }

  const adapter = await getStorageAdapterAsync(locals);
  const siteSettings = await adapter.getSiteSettings();
  const styleRevision = resolveSiteStyleRevision(siteSettings);
  const component = await adapter.getComponentDSL(componentId);
  if (!component) {
    return new Response("Component not found", { status: 404 });
  }
  const cachedHtml = await getComponentSnapshotHtml(componentId, adapter);

  if (
    !shouldRefresh &&
    cachedHtml &&
    hasCurrentComponentSnapshotVersion(
      cachedHtml,
      styleRevision,
      component.updatedAt ?? null,
    )
  ) {
    return respondWithSnapshotHtml(cachedHtml);
  }

  const snapshotInput = await buildComponentSnapshotInput(componentId, adapter);
  if (!snapshotInput) {
    return new Response("Component not found", { status: 404 });
  }

  await saveComponentSnapshot(snapshotInput, adapter, { locals });

  const renderedHtml = await getComponentSnapshotHtml(componentId, adapter);
  if (!renderedHtml) {
    return new Response("Snapshot unavailable", { status: 500 });
  }

  return respondWithSnapshotHtml(renderedHtml);
};
