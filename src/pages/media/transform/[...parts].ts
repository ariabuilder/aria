import type { APIRoute } from "astro";

import { getCloudflareEnv } from "../../../../aria/lib/cloudflare/env";
import {
  renderWithCloudflareImages,
  renderWithLocalImageRuntime,
  buildMediaTransformRevision,
  resolveMediaTransformSourceObjectKey,
  type RuntimeImagesBinding,
} from "../../../../aria/lib/media/transforms/render";
import { getStorageAdapterAsync } from "../../../../aria/lib/storage/getStorageAdapter";
import {
  MEDIA_TRANSFORM_INPUT_MAX_BYTES,
  MEDIA_TRANSFORM_INPUT_MAX_BYTES_LABEL,
} from "../../../../aria/lib/media/uploadLimits";
import { resolveResponsiveDerivativeWidth } from "../../../../aria/lib/media/transforms/responsive";

export const prerender = false;

function responseHeaders(contentType: string): HeadersInit {
  return {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
    Vary: "Accept",
    "X-Content-Type-Options": "nosniff",
  };
}

export const GET: APIRoute = async ({ params, request, locals }) => {
  const [id, revision, rawWidth, ...extra] = (params.parts ?? "")
    .split("/")
    .filter(Boolean);
  if (!id || !revision || extra.length > 0) {
    return new Response("Not found", { status: 404 });
  }

  const adapter = await getStorageAdapterAsync(locals);
  const variant = await adapter.getMediaTransformVariant(id);
  if (!variant) return new Response("Not found", { status: 404 });
  if (revision !== buildMediaTransformRevision(variant)) {
    return new Response("Not found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const derivativeWidth = rawWidth
    ? resolveResponsiveDerivativeWidth(rawWidth, variant.output.width)
    : null;
  if (rawWidth && derivativeWidth === null) {
    return new Response("Not found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const state = await adapter.getMediaTransformState(variant.assetPath);
  const sourceVersion = state.sourceVersions.find(
    (item) => item.version === variant.sourceVersion,
  );
  const source = await adapter.getMedia(
    resolveMediaTransformSourceObjectKey(
      variant.assetPath,
      sourceVersion?.objectKey,
    ),
  );
  if (!source) return new Response("Source image not found", { status: 404 });
  if (source.byteLength > MEDIA_TRANSFORM_INPUT_MAX_BYTES) {
    return new Response(
      `Image transforms support source files up to ${MEDIA_TRANSFORM_INPUT_MAX_BYTES_LABEL}.`,
      {
        status: 422,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }

  const input = {
    source: new Uint8Array(source),
    sourceMimeType: sourceVersion?.mimeType ?? null,
    // Focal placement is resolved into the normalized crop when a ratio crop
    // is created. Delivery intentionally renders that saved/manual crop exactly.
    crop: variant.crop,
    output: derivativeWidth
      ? { ...variant.output, width: derivativeWidth, height: null }
      : variant.output,
    accept: request.headers.get("Accept"),
  };
  const env = getCloudflareEnv(locals);
  const images = env.aria_images as RuntimeImagesBinding | undefined;

  try {
    if (images) {
      const transformed = await renderWithCloudflareImages(images, input);
      return new Response(transformed.body, {
        status: transformed.status,
        headers: responseHeaders(
          transformed.headers.get("Content-Type") ?? "image/webp",
        ),
      });
    }

    const transformed = await renderWithLocalImageRuntime(input);
    return new Response(transformed.bytes as BodyInit, {
      headers: responseHeaders(transformed.contentType),
    });
  } catch (error) {
    console.error("[media.transform] render failed", {
      variantId: variant.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return new Response("Image transform failed", { status: 500 });
  }
};
