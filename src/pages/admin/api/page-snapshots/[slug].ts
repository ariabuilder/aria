import type { APIRoute } from "astro";
import { z } from "zod";

import {
  hasCurrentPageSnapshotVersion,
  savePageSnapshot,
} from "../../../../../aria/lib/rendering/pageSnapshots";
import { getStorageAdapterAsync } from "../../../../../aria/lib/storage/getStorageAdapter";
import {
  getPageSnapshotHtml,
  PageSnapshotStageSchema,
} from "../../../../../aria/lib/rendering/pageSnapshots";
import { resolveSiteStyleRevision } from "../../../../../aria/lib/storage/adapter";
import { requireAdminApiCapabilities } from "../_auth";

const SlugParamSchema = z.string().trim().min(1);

function preparePageSnapshotForThumbnailCapture(html: string): string {
  return html
    .replace(/\s*<script\b[\s\S]*?<\/script>/gi, "")
    .replace(
      /\s*<link\b(?=[^>]*\brel=["'](?:icon|modulepreload)["'])[^>]*>/gi,
      "",
    )
    .replace(
      /\s*<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">/gi,
      "",
    )
    .replace(
      /\s*<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>/gi,
      "",
    )
    .replace(
      /\s*<link href="https:\/\/fonts\.googleapis\.com[^\"]*" rel="stylesheet">/gi,
      "",
    )
    .replace(
      /@import\s+url\(["']?https:\/\/fonts\.(?:googleapis|gstatic)\.com[^)]+\)["']?\s*;?/gi,
      "",
    );
}

export const GET: APIRoute = async ({ params, locals, cookies, request }) => {
  const slug = SlugParamSchema.parse(params.slug);
  const url = new URL(request.url);
  const requestedStage = PageSnapshotStageSchema.parse(
    url.searchParams.get("stage") === "published" ? "published" : "draft",
  );
  const isThumbnailRequest =
    url.searchParams.get("thumb") === "1" ||
    url.searchParams.get("thumb") === "true";
  const shouldRefresh =
    url.searchParams.get("refresh") === "1" ||
    url.searchParams.get("refresh") === "true";

  const auth = await requireAdminApiCapabilities({
    locals,
    cookies,
    anyOf:
      requestedStage === "published"
        ? ["reviewContent", "editPageContent", "editPages"]
        : ["editPageContent", "editPages"],
  });
  if (!auth.ok) {
    return auth.response;
  }

  const adapter = await getStorageAdapterAsync(locals);
  const siteSettings = await adapter.getSiteSettings();
  const styleRevision = resolveSiteStyleRevision(siteSettings);
  const cachedHtml = await getPageSnapshotHtml(slug, requestedStage, adapter);

  if (
    !shouldRefresh &&
    cachedHtml &&
    hasCurrentPageSnapshotVersion(cachedHtml, styleRevision)
  ) {
    return new Response(
      isThumbnailRequest
        ? preparePageSnapshotForThumbnailCapture(cachedHtml)
        : cachedHtml,
      {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "private, max-age=600, stale-while-revalidate=86400",
        },
      },
    );
  }

  const page =
    requestedStage === "published"
      ? await adapter.getPublishedPageDSL(slug)
      : await adapter.getPageDSL(slug);

  if (page) {
    await savePageSnapshot(
      {
        page,
        stage: requestedStage,
      },
      adapter,
      { locals },
    );

    const renderedHtml = await getPageSnapshotHtml(
      slug,
      requestedStage,
      adapter,
    );
    if (renderedHtml) {
      return new Response(
        isThumbnailRequest
          ? preparePageSnapshotForThumbnailCapture(renderedHtml)
          : renderedHtml,
        {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control":
              "private, max-age=600, stale-while-revalidate=86400",
          },
        },
      );
    }
  }

  return new Response("Snapshot not found", { status: 404 });
};
