import { z } from "zod";

import {
  PageSnapshotStageSchema,
  type PageSnapshotStage,
} from "./pageSnapshotStages";

export const MAX_PAGE_THUMBNAIL_BYTES = 2 * 1024 * 1024;

export const PageThumbnailPageIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine(
    (value) =>
      !value.includes("/") &&
      !value.includes("\\") &&
      value !== "." &&
      value !== "..",
    "Invalid page thumbnail page id",
  );

export const PageThumbnailMimeTypeSchema = z.enum(["image/webp", "image/png"]);

export type PageThumbnailMimeType = z.infer<typeof PageThumbnailMimeTypeSchema>;

export const PageThumbnailQuerySchema = z.object({
  stage: PageSnapshotStageSchema.optional(),
});

export const PageThumbnailDeleteResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    pageId: PageThumbnailPageIdSchema,
    deletedStages: z.array(PageSnapshotStageSchema),
  }),
});

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

export const PageThumbnailSaveResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    pageId: PageThumbnailPageIdSchema,
    stage: PageSnapshotStageSchema,
    contentType: PageThumbnailMimeTypeSchema,
    size: z.int().positive(),
    thumbnailUrl: z.string().trim().min(1),
  }),
});

export const PageThumbnailUploadFileSchema = z
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

    if (file.size > MAX_PAGE_THUMBNAIL_BYTES) {
      ctx.addIssue({
        code: "custom",
        message: `Thumbnail file exceeds ${MAX_PAGE_THUMBNAIL_BYTES} byte limit`,
      });
    }

    if (!PageThumbnailMimeTypeSchema.safeParse(file.type).success) {
      ctx.addIssue({
        code: "custom",
        message: "Unsupported thumbnail content type",
      });
    }
  });

export const PageThumbnailUploadFormSchema = z.object({
  file: PageThumbnailUploadFileSchema,
});

export const PageThumbnailSaveInputSchema = z.object({
  pageId: PageThumbnailPageIdSchema,
  stage: PageSnapshotStageSchema,
  file: PageThumbnailUploadFileSchema,
});

export const PageThumbnailDeleteInputSchema = z.object({
  pageId: PageThumbnailPageIdSchema,
  stage: PageSnapshotStageSchema.optional(),
});

export function resolvePageThumbnailStage(
  rawStage: unknown,
  fallback: PageSnapshotStage = "draft",
): PageSnapshotStage {
  const parsed = PageThumbnailQuerySchema.parse({ stage: rawStage });
  return parsed.stage ?? fallback;
}

export function resolveOptionalPageThumbnailStage(
  rawStage: unknown,
): PageSnapshotStage | undefined {
  const parsed = PageThumbnailQuerySchema.parse({ stage: rawStage });
  return parsed.stage;
}

export function parsePageThumbnailUploadFormData(
  formData: FormData,
): z.infer<typeof PageThumbnailUploadFormSchema> {
  return PageThumbnailUploadFormSchema.parse({
    file: formData.get("file"),
  });
}

export function buildPageThumbnailStorageKey(
  pageId: string,
  stage: PageSnapshotStage,
): string {
  return `thumbnails/page/${PageThumbnailPageIdSchema.parse(pageId)}/${PageSnapshotStageSchema.parse(stage)}.webp`;
}

export function buildPageThumbnailAdminUrl(
  pageId: string,
  stage: PageSnapshotStage,
  updatedAt?: string | null,
  styleRevision?: string | null,
): string {
  const safePageId = encodeURIComponent(
    PageThumbnailPageIdSchema.parse(pageId),
  );
  const parsedStage = PageSnapshotStageSchema.parse(stage);
  const params = new URLSearchParams({ stage: parsedStage });

  if (typeof updatedAt === "string" && updatedAt.trim().length > 0) {
    params.set("v", updatedAt);
  }

  if (typeof styleRevision === "string" && styleRevision.trim().length > 0) {
    params.set("sr", styleRevision.trim());
  }

  return `/admin/api/page-thumbnails/${safePageId}?${params.toString()}`;
}

export function buildStoredPageThumbnailKey(
  pageId: string,
  stage: PageSnapshotStage,
): string {
  return `${PageThumbnailPageIdSchema.parse(pageId)}:${PageSnapshotStageSchema.parse(stage)}`;
}

export function buildPageThumbnailAdminUrlWhenStored(
  storedThumbnailKeys: ReadonlySet<string>,
  pageId: string,
  stage: PageSnapshotStage,
  updatedAt?: string | null,
  styleRevision?: string | null,
): string | undefined {
  if (!storedThumbnailKeys.has(buildStoredPageThumbnailKey(pageId, stage))) {
    return undefined;
  }

  return buildPageThumbnailAdminUrl(pageId, stage, updatedAt, styleRevision);
}
