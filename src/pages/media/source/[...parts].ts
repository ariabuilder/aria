import type { APIRoute } from "astro";

import { getCloudflareEnv } from "../../../../aria/lib/cloudflare/env";
import { normalizeLogicalMediaPath } from "../../../../aria/lib/media/utils/path";
import {
  buildMediaSourceUrl,
  resolveCurrentMediaSourceVersion,
} from "../../../../aria/lib/media/transforms/urls";
import {
  renderWithCloudflareImages,
  renderWithLocalImageRuntime,
  type RuntimeImagesBinding,
} from "../../../../aria/lib/media/transforms/render";
import { resolveResponsiveDerivativeWidth } from "../../../../aria/lib/media/transforms/responsive";
import { MediaTransformOutputSchema } from "../../../../aria/lib/media/transforms/schemas";
import {
  MEDIA_TRANSFORM_INPUT_MAX_BYTES,
  MEDIA_TRANSFORM_INPUT_MAX_BYTES_LABEL,
} from "../../../../aria/lib/media/uploadLimits";
import { getStorageAdapterAsync } from "../../../../aria/lib/storage/getStorageAdapter";

export const prerender = false;

function transformedResponseHeaders(contentType: string): HeadersInit {
  return {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
    Vary: "Accept",
    "X-Content-Type-Options": "nosniff",
  };
}

export const GET: APIRoute = async ({ params, request, locals }) => {
  const [rawVersion, ...segments] = (params.parts ?? "")
    .split("/")
    .filter(Boolean);
  const sourceVersion = Number(rawVersion);
  const isCurrentPointer = rawVersion === "current";
  if (
    (!isCurrentPointer &&
      (!Number.isInteger(sourceVersion) || sourceVersion < 1)) ||
    segments.length === 0
  ) {
    return new Response("Not found", { status: 404 });
  }

  let assetPath: string;
  try {
    assetPath = normalizeLogicalMediaPath(
      segments.map((segment) => decodeURIComponent(segment)).join("/"),
    );
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const adapter = await getStorageAdapterAsync(locals);
  const state = await adapter.getMediaTransformState(assetPath);
  const currentSourceVersion = resolveCurrentMediaSourceVersion(state);
  const requestedWidth = new URL(request.url).searchParams.get("width");
  const currentSource = state.sourceVersions.find(
    (item) => item.version === currentSourceVersion,
  );
  const derivativeWidth = requestedWidth
    ? resolveResponsiveDerivativeWidth(requestedWidth, currentSource?.width)
    : null;
  if (requestedWidth && derivativeWidth === null) {
    return new Response("Not found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (isCurrentPointer) {
    if (currentSourceVersion === null || !currentSource) {
      return new Response("Not found", {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    }
    const location = new URL(
      buildMediaSourceUrl({
        assetPath,
        sourceVersion: currentSourceVersion,
      }),
      request.url,
    );
    if (derivativeWidth) {
      location.searchParams.set("width", String(derivativeWidth));
    }
    return new Response(null, {
      status: 307,
      headers: {
        Location: `${location.pathname}${location.search}`,
        "Cache-Control": "no-store",
      },
    });
  }
  if (currentSourceVersion !== sourceVersion) {
    return new Response("Not found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const source = state.sourceVersions.find(
    (item) => item.version === sourceVersion,
  );
  if (!source) return new Response("Not found", { status: 404 });
  const bytes = await adapter.getMedia(source.objectKey);
  if (!bytes) return new Response("Not found", { status: 404 });

  if (derivativeWidth) {
    if (bytes.byteLength > MEDIA_TRANSFORM_INPUT_MAX_BYTES) {
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
      source: new Uint8Array(bytes),
      sourceMimeType: source.mimeType,
      crop: { x: 0, y: 0, width: 1, height: 1 },
      output: MediaTransformOutputSchema.parse({
        width: derivativeWidth,
        height: null,
        format: "auto",
        quality: 100,
      }),
      accept: request.headers.get("Accept"),
    };
    const env = getCloudflareEnv(locals);
    const images = env.aria_images as RuntimeImagesBinding | undefined;

    try {
      if (images) {
        const transformed = await renderWithCloudflareImages(images, input);
        return new Response(transformed.body, {
          status: transformed.status,
          headers: transformedResponseHeaders(
            transformed.headers.get("Content-Type") ?? "image/webp",
          ),
        });
      }

      const transformed = await renderWithLocalImageRuntime(input);
      return new Response(transformed.bytes as BodyInit, {
        headers: transformedResponseHeaders(transformed.contentType),
      });
    } catch (error) {
      console.error("[media.source] responsive render failed", {
        assetPath,
        sourceVersion,
        derivativeWidth,
        message: error instanceof Error ? error.message : String(error),
      });
      return new Response("Image transform failed", { status: 500 });
    }
  }

  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": source.mimeType ?? "application/octet-stream",
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
};
