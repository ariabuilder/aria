import { ActionError, type ActionAPIContext } from "astro:actions";
import { z } from "astro/zod";
import type { EndpointId } from "../lib/media/endpoints/registry";
import {
  logicalPathToObjectKey,
  normalizeLogicalMediaPath,
} from "../lib/media/utils/path";
import { getMediaTypeFromMimeOrFilename } from "../lib/media/utils/mediaType";
import { isListableMediaPath } from "../lib/media/utils/visibility";
import { getStorageAdapterAsync } from "../lib/storage/getStorageAdapter";
import type { StorageAdapter } from "../lib/storage/adapter";
import { log as baseLog } from "../lib/utils/logger";
import { requireOperation } from "./_shared";

export const ListMediaInputSchema = z
  .object({
    folder: z.string().optional(),
  })
  .optional();

async function getAdapter(context: ActionAPIContext): Promise<StorageAdapter> {
  return getStorageAdapterAsync(context.locals);
}

function isCloudflareAdapter(adapter: StorageAdapter): boolean {
  return adapter.constructor?.name === "CloudflareStorageAdapter";
}

function inferUploadEndpointId(adapter: StorageAdapter): EndpointId {
  return isCloudflareAdapter(adapter) ? "cloudflare-r2" : "local-fs";
}

function getExtension(filename: string): string | undefined {
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === filename.length - 1) {
    return undefined;
  }

  return filename.slice(dotIndex + 1).toLowerCase();
}

function inferContentTypeFromFilename(filename: string): string | undefined {
  const extension = getExtension(filename);

  switch (extension) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "ico":
      return "image/x-icon";
    case "avif":
      return "image/avif";
    case "pdf":
      return "application/pdf";
    case "mp4":
      return "video/mp4";
    case "webm":
      return "video/webm";
    case "mov":
      return "video/quicktime";
    case "zip":
      return "application/zip";
    default:
      return undefined;
  }
}

/** Handle the `media.list` action without pulling in lifecycle/mutation server code. */
export async function handleListMedia(
  input: z.infer<typeof ListMediaInputSchema>,
  context: ActionAPIContext,
): Promise<Record<string, unknown>[]> {
  await requireOperation(context, "media.list");

  try {
    const adapter = await getAdapter(context);
    const endpointId = inferUploadEndpointId(adapter);
    const [listedFiles, cropCounts] = await Promise.all([
      adapter.listMedia(input?.folder),
      adapter.listMediaTransformVariantCounts(),
    ]);
    const files = listedFiles.filter((file) => isListableMediaPath(file.path));
    const logicalPaths = files.map((file) =>
      normalizeLogicalMediaPath(file.path),
    );
    const catalogRows =
      typeof adapter.listMediaCatalogAssetsByLogicalPaths === "function"
        ? await adapter.listMediaCatalogAssetsByLogicalPaths(logicalPaths)
        : [];
    const catalogByPath = new Map(
      catalogRows.map((row) => [
        normalizeLogicalMediaPath(row.logical_path),
        row,
      ]),
    );

    return files.map((file) => {
      const logicalPath = normalizeLogicalMediaPath(file.path);
      const contentType =
        file.contentType || inferContentTypeFromFilename(file.path);
      const mediaType = getMediaTypeFromMimeOrFilename(contentType, file.path);
      const catalog = catalogByPath.get(logicalPath);
      const dimensions =
        catalog?.width && catalog?.height
          ? { width: catalog.width, height: catalog.height }
          : undefined;

      return {
        id: file.path,
        mediaId: catalog?.id,
        name: file.path.split("/").pop() || file.path,
        type: mediaType,
        url: logicalPath,
        deliveryUrl: logicalPath,
        thumbnailUrl: logicalPath,
        isTransformed: false,
        transformProvider: "none",
        cropCount: cropCounts[logicalPath] ?? 0,
        size: file.size,
        dimensions,
        mimeType: contentType,
        uploadedAt: file.createdAt,
        endpointId,
        objectKey: logicalPathToObjectKey(logicalPath),
        publicUrl: file.url,
      };
    });
  } catch (error) {
    if (error instanceof ActionError) throw error;
    baseLog("error", "[media.list] Error", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new ActionError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to list media",
    });
  }
}
