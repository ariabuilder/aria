import { z } from "zod";

import { ComponentThumbnailIdSchema } from "../schemas/componentPreview";

export const MAX_COMPONENT_THUMBNAIL_BYTES = 2 * 1024 * 1024;

export const ComponentThumbnailMimeTypeSchema = z.enum([
  "image/webp",
  "image/png",
]);

export type ComponentThumbnailMimeType = z.infer<
  typeof ComponentThumbnailMimeTypeSchema
>;

function isFileLike(value: unknown): value is File {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<File>;
  return (
    typeof candidate.name === "string" &&
    typeof candidate.size === "number" &&
    typeof candidate.type === "string" &&
    typeof candidate.arrayBuffer === "function"
  );
}

export const ComponentThumbnailUploadFileSchema = z
  .custom<File>((value): value is File => isFileLike(value), {
    message: "Expected thumbnail file upload",
  })
  .superRefine((file, ctx) => {
    if (file.size <= 0) {
      ctx.addIssue({
        code: "custom",
        message: "Thumbnail file must not be empty",
      });
    }

    if (file.size > MAX_COMPONENT_THUMBNAIL_BYTES) {
      ctx.addIssue({
        code: "custom",
        message: `Thumbnail file exceeds ${MAX_COMPONENT_THUMBNAIL_BYTES} byte limit`,
      });
    }

    if (!ComponentThumbnailMimeTypeSchema.safeParse(file.type).success) {
      ctx.addIssue({
        code: "custom",
        message: "Unsupported thumbnail content type",
      });
    }
  });

export function buildComponentThumbnailAdminUrl(
  componentId: string,
  updatedAt?: string | null,
  styleRevision?: string | null,
): string {
  const safeComponentId = encodeURIComponent(
    ComponentThumbnailIdSchema.parse(componentId),
  );
  const params = new URLSearchParams();

  if (typeof updatedAt === "string" && updatedAt.trim().length > 0) {
    params.set("v", updatedAt);
  }

  if (typeof styleRevision === "string" && styleRevision.trim().length > 0) {
    params.set("sr", styleRevision.trim());
  }

  const query = params.toString();
  return query
    ? `/admin/api/component-thumbnails/${safeComponentId}?${query}`
    : `/admin/api/component-thumbnails/${safeComponentId}`;
}

export function buildComponentThumbnailAdminUrlWhenStored(
  storedThumbnailKeys: ReadonlySet<string>,
  componentId: string,
  updatedAt?: string | null,
  styleRevision?: string | null,
): string | undefined {
  if (!storedThumbnailKeys.has(ComponentThumbnailIdSchema.parse(componentId))) {
    return undefined;
  }

  return buildComponentThumbnailAdminUrl(componentId, updatedAt, styleRevision);
}

export function decodeComponentThumbnailBase64(
  fileBase64: string,
  mimeType: ComponentThumbnailMimeType,
): Blob {
  const normalized = fileBase64.trim();
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}
