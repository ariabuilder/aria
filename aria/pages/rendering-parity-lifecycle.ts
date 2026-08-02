import type { APIRoute } from "astro";
import { z } from "zod";

import { regenerateGlobalCSSArtifacts } from "../actions/styles/globalCssArtifacts";
import { renderPageDslToHtml } from "../lib/rendering/renderPageDslToHtml";
import { LayoutDSLSchema, PageDSLSchema } from "../lib/schemas/nodes";
import { getStorageAdapterAsync } from "../lib/storage/getStorageAdapter";
import type { SiteSettings } from "../lib/storage/adapter";
import { buildCurrentCompilerMetadata } from "../lib/system/metadata";
import { isRenderingParityLoopbackHostname } from "./renderingParityRoute";

export const prerender = false;

const RequestSchema = z
  .object({
    runtime: z.enum(["node", "workerd"]),
  })
  .strict();

const PAGE_ID = "rendering-parity-managed-image";
const LAYOUT_ID = "rendering-parity-managed-image-layout";

export const GET: APIRoute = async ({ url, locals }) => {
  if (!isRenderingParityLoopbackHostname(url.hostname)) {
    return new Response("Not found", { status: 404 });
  }
  const query = RequestSchema.safeParse({
    runtime: url.searchParams.get("runtime"),
  });
  if (!query.success) {
    return new Response("Invalid lifecycle request", { status: 400 });
  }

  const adapter = await getStorageAdapterAsync(locals);
  const published = await adapter.getPublishedPageDSL(PAGE_ID);
  if (!published) {
    return new Response("Published lifecycle fixture is unavailable", {
      status: 404,
    });
  }
  const rendered = await renderPageDslToHtml({
    page: published,
    adapter,
    pathOrSlug: published.slug,
    locals,
  });
  return new Response(rendered.html, {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
    },
  });
};

export const POST: APIRoute = async ({ request, url, locals }) => {
  if (!isRenderingParityLoopbackHostname(url.hostname)) {
    return new Response("Not found", { status: 404 });
  }

  const rawBody: unknown = await request.json().catch(() => null);
  const parsed = RequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { code: "RENDER_INPUT_INVALID", message: "Invalid lifecycle request." },
      { status: 400 },
    );
  }

  const adapter = await getStorageAdapterAsync(locals);
  const existingLayout = await adapter.getLayoutDSL(LAYOUT_ID);
  const existing = await adapter.getPageDSL(PAGE_ID);
  const layout = LayoutDSLSchema.parse({
    id: LAYOUT_ID,
    name: "Managed image parity layout",
    nodes: [],
    slots: [
      { name: "header", label: "Header" },
      { name: "main", label: "Main", isDefault: true },
      {
        name: "footer",
        label: "Footer",
        defaultContent: [
          {
            id: "lifecycle-image",
            type: "Image",
            slot: "footer",
            props: {
              src: "/media/source/current/rendering-parity.svg",
              alt: "Managed image lifecycle fixture",
              "data-rendering-lifecycle": "managed-image",
            },
            classNames: { base: ["h-8"] },
            styles: {},
            children: [],
            metadata: {
              responsiveImage: {
                sizes: "100vw",
                default: {
                  url: "/media/source/current/rendering-parity.svg",
                  reference: {
                    mediaId: "rendering-parity",
                    variantId: null,
                  },
                  width: 727,
                  height: 621,
                  allowDerivatives: true,
                },
                sources: {},
              },
            },
          },
        ],
      },
    ],
  });
  await adapter.saveLayoutDSL(LAYOUT_ID, layout, {
    ...(existingLayout?.version
      ? { expectedVersion: existingLayout.version }
      : {}),
    skipIfContentUnchanged: false,
  });
  const page = PageDSLSchema.parse({
    id: PAGE_ID,
    title: "Managed image parity",
    slug: PAGE_ID,
    description: "Rendering v2 managed-image lifecycle fixture",
    layout: LAYOUT_ID,
    nodes: [
      {
        id: "lifecycle-main-content",
        type: "Text",
        slot: "main",
        props: { content: "Managed image lifecycle main content" },
        styles: {},
        children: [],
      },
    ],
  });

  const savedVersion = await adapter.savePageDSL(PAGE_ID, page, {
    ...(existing?.version ? { expectedVersion: existing.version } : {}),
    skipIfContentUnchanged: false,
  });
  const reloaded = await adapter.getPageDSL(PAGE_ID);
  if (!reloaded || reloaded.version !== savedVersion) {
    return Response.json(
      {
        code: "RENDER_REVISION_STALE",
        message: "Saved lifecycle revision could not be reloaded.",
      },
      { status: 409 },
    );
  }

  const currentSettings = await adapter.getSiteSettings();
  const utilitySettings = {
    ...(currentSettings ?? {}),
    utilityEngine: "unocss",
  } satisfies SiteSettings;
  await adapter.saveSiteSettings(utilitySettings);

  const styles = await regenerateGlobalCSSArtifacts(adapter, {
    utilityNodes: reloaded.nodes,
  });
  const preview = await renderPageDslToHtml({
    page: reloaded,
    adapter,
    pathOrSlug: reloaded.slug,
    locals,
  });
  if (
    !preview.html.includes("aria-managed-image") ||
    !preview.html.includes(`/styles/global.css?v=${styles.globalCSSHash}`)
  ) {
    return Response.json(
      {
        code: "RENDER_ARTIFACT_MISSING",
        message:
          "Draft preview did not reference the compiled render artifact.",
      },
      { status: 503 },
    );
  }

  const publishedVersion = await adapter.publishPageDSL(PAGE_ID, undefined, {
    expectedVersion: savedVersion,
    compilerMetadata: buildCurrentCompilerMetadata(),
  });
  if (publishedVersion !== savedVersion) {
    return Response.json(
      {
        code: "RENDER_REVISION_STALE",
        message: "Published pointer did not advance to the saved revision.",
      },
      { status: 409 },
    );
  }

  const published = await adapter.getPublishedPageDSL(PAGE_ID);
  if (!published || published.version !== savedVersion) {
    return Response.json(
      {
        code: "RENDER_REVISION_STALE",
        message: "Published lifecycle revision could not be reloaded.",
      },
      { status: 409 },
    );
  }

  return Response.json(
    {
      runtime: parsed.data.runtime,
      slug: published.slug,
      savedVersion,
      publishedVersion,
      globalCssHash: styles.globalCSSHash,
      previewManagedImage: true,
    },
    { headers: { "cache-control": "no-store" } },
  );
};
