import { describe, expect, it, vi } from "vitest";

const loggerMock = vi.fn();

vi.mock("@/lib/utils/logger", () => ({
  log: loggerMock,
}));

describe("mediaActionResults", () => {
  it("accepts icon media payloads", async () => {
    const { parseMediaListPayload, parseUploadMediaPayload } =
      await import("../../admin/features/Studio/media/composables/mediaActionResults");

    expect(
      parseMediaListPayload([
        {
          id: "asset-icon",
          name: "brand-mark.svg",
          type: "icon",
          url: "/uploads/brand-mark.svg",
          size: 1280,
          mimeType: "image/svg+xml",
        },
      ]),
    ).toEqual([
      {
        id: "asset-icon",
        name: "brand-mark.svg",
        type: "icon",
        url: "/uploads/brand-mark.svg",
        size: 1280,
        mimeType: "image/svg+xml",
      },
    ]);

    const uploadPayload = {
      success: true as const,
      url: "/uploads/brand-mark.svg",
      publicUrl: "/uploads/brand-mark.svg",
      name: "brand-mark.svg",
      size: 1280,
      type: "icon" as const,
      endpointId: "local-fs",
    };

    expect(parseUploadMediaPayload(uploadPayload)).toEqual(uploadPayload);
    expect(parseUploadMediaPayload(uploadPayload)).not.toBeNull();
  });

  it("parseDeleteMediaPayload coerces malformed references", async () => {
    const { parseDeleteMediaPayload } =
      await import("../../admin/features/Studio/media/composables/mediaActionResults");

    expect(
      parseDeleteMediaPayload({
        success: true,
        references: {
          updatedResources: 0,
          updatedLocations: 0,
          failures: [{ kind: "invalid", refId: "x", error: "nope" }],
          warnings: [""],
        },
      }),
    ).toEqual({
      success: true,
      status: "completed",
      deleted: true,
      references: {
        updatedResources: 0,
        updatedLocations: 0,
        failures: [],
        warnings: [],
      },
    });
  });

  it("parseRenameMediaPayload accepts payloads missing references", async () => {
    const { parseRenameMediaPayload } =
      await import("../../admin/features/Studio/media/composables/mediaActionResults");

    expect(
      parseRenameMediaPayload({
        success: true,
        oldPath: "aria-icon-7aba8d.svg",
        newPath: "aria-icon.svg",
        url: "/uploads/aria-icon.svg",
        publicUrl: "/uploads/aria-icon.svg",
      }),
    ).toEqual({
      success: true,
      status: "completed",
      oldRetained: false,
      oldPath: "aria-icon-7aba8d.svg",
      newPath: "aria-icon.svg",
      url: "/uploads/aria-icon.svg",
      publicUrl: "/uploads/aria-icon.svg",
      references: {
        updatedResources: 0,
        updatedLocations: 0,
        failures: [],
        warnings: [],
      },
    });
  });

  it("parseRenameMediaPayload coerces malformed references", async () => {
    const { parseRenameMediaPayload } =
      await import("../../admin/features/Studio/media/composables/mediaActionResults");

    expect(
      parseRenameMediaPayload({
        success: true,
        oldPath: "aria-icon-7aba8d.svg",
        newPath: "aria-icon.svg",
        url: "/uploads/aria-icon.svg",
        publicUrl: "/uploads/aria-icon.svg",
        references: {
          updatedResources: 0,
          updatedLocations: 0,
          failures: [{ kind: "invalid", refId: "x", error: "nope" }],
          warnings: [""],
        },
      }),
    ).toEqual({
      success: true,
      status: "completed",
      oldRetained: false,
      oldPath: "aria-icon-7aba8d.svg",
      newPath: "aria-icon.svg",
      url: "/uploads/aria-icon.svg",
      publicUrl: "/uploads/aria-icon.svg",
      references: {
        updatedResources: 0,
        updatedLocations: 0,
        failures: [],
        warnings: [],
      },
    });
  });

  it("parseRenameMediaPayload derives url from newPath when omitted", async () => {
    const { parseRenameMediaPayload } =
      await import("../../admin/features/Studio/media/composables/mediaActionResults");

    expect(
      parseRenameMediaPayload({
        success: true,
        oldPath: "aria-icon-7aba8d.svg",
        newPath: "/uploads/aria-icon.svg",
      }),
    ).toEqual({
      success: true,
      status: "completed",
      oldRetained: false,
      oldPath: "aria-icon-7aba8d.svg",
      newPath: "aria-icon.svg",
      url: "/uploads/aria-icon.svg",
      publicUrl: "/uploads/aria-icon.svg",
      references: {
        updatedResources: 0,
        updatedLocations: 0,
        failures: [],
        warnings: [],
      },
    });
  });

  it("parseUploadMediaPayload rejects malformed upload payloads", async () => {
    const { parseUploadMediaPayload } =
      await import("../../admin/features/Studio/media/composables/mediaActionResults");

    const result = parseUploadMediaPayload(
      {
        success: true,
        url: "/uploads/hero.jpg",
        publicUrl: "/uploads/hero.jpg",
        name: "hero.jpg",
        size: 128,
        type: "image",
      },
      {
        source: "MediaPickerDialog.handleUpload",
        fileName: "hero.jpg",
      },
    );

    expect(result).toBeNull();
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[Media] Invalid upload payload",
      expect.objectContaining({
        source: "MediaPickerDialog.handleUpload",
        fileName: "hero.jpg",
        issues: expect.any(Array),
      }),
    );
  });

  it("accepts media.list-shaped payloads with objectKey", async () => {
    const { parseMediaListPayload } =
      await import("../../admin/features/Studio/media/composables/mediaActionResults");

    const mediaListItem = {
      id: "gallery/hero.jpg",
      name: "hero.jpg",
      type: "image" as const,
      url: "/uploads/gallery/hero.jpg",
      deliveryUrl: "/uploads/gallery/hero.jpg",
      thumbnailUrl: "/uploads/gallery/hero.jpg",
      isTransformed: false,
      transformProvider: "none",
      cropCount: 2,
      size: 2048,
      mimeType: "image/jpeg",
      uploadedAt: "2026-06-01T12:00:00.000Z",
      endpointId: "aria-r2",
      objectKey: "gallery/hero.jpg",
      publicUrl: "https://cdn.example.com/gallery/hero.jpg",
    };

    expect(parseMediaListPayload([mediaListItem])).toEqual([mediaListItem]);
    expect(loggerMock).not.toHaveBeenCalledWith(
      "warn",
      "[Media] Invalid media list payload",
      expect.anything(),
    );
  });

  it("rejects malformed media list payloads", async () => {
    const { parseMediaListPayload } =
      await import("../../admin/features/Studio/media/composables/mediaActionResults");

    const result = parseMediaListPayload(
      [
        {
          id: "asset-1",
          name: "Hero",
          type: "image",
          url: "/uploads/hero.jpg",
          size: "invalid",
        },
      ],
      {
        source: "MediaPickerDialog.loadAssets",
      },
    );

    expect(result).toBeNull();
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[Media] Invalid media list payload",
      expect.objectContaining({
        source: "MediaPickerDialog.loadAssets",
        issues: expect.any(Array),
      }),
    );
  });

  it("rejects malformed media upload payloads", async () => {
    const { parseUploadMediaPayload } =
      await import("../../admin/features/Studio/media/composables/mediaActionResults");

    const result = parseUploadMediaPayload(
      {
        success: true,
        url: "/uploads/hero.jpg",
        publicUrl: "/uploads/hero.jpg",
        name: "hero.jpg",
        size: 128,
        type: "image",
      },
      {
        source: "MediaPickerDialog.handleUpload",
        fileName: "hero.jpg",
      },
    );

    expect(result).toBeNull();
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[Media] Invalid upload payload",
      expect.objectContaining({
        source: "MediaPickerDialog.handleUpload",
        fileName: "hero.jpg",
        issues: expect.any(Array),
      }),
    );
  });

  it("rejects malformed media sync plan payloads", async () => {
    const { unwrapMediaSyncPlanResult } =
      await import("../../admin/features/Studio/media/composables/mediaActionResults");

    const result = unwrapMediaSyncPlanResult(
      {
        data: {
          success: true,
          mode: "dry-run",
          jobId: "job-1",
          plan: {
            sourceEndpointId: "local",
            targetEndpointId: "remote",
            direction: "push",
            conflictPolicy: "newest-wins",
            includeDeletes: false,
            items: [],
            summary: {
              total: "1",
              created: 0,
              updated: 0,
              deleted: 0,
              skipped: 0,
              conflicted: 0,
              failed: 0,
            },
          },
        },
        error: null,
      },
      {
        source: "useMediaSync.runSyncPlan",
      },
    );

    expect(result).toEqual({
      success: false,
      error: "Failed to generate sync plan",
    });
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[Media] Invalid sync plan response",
      expect.objectContaining({
        source: "useMediaSync.runSyncPlan",
        issues: expect.any(Array),
      }),
    );
  });

  it("surfaces transport errors for media sync apply responses", async () => {
    const { unwrapMediaSyncApplyResult } =
      await import("../../admin/features/Studio/media/composables/mediaActionResults");

    const result = unwrapMediaSyncApplyResult({
      data: undefined,
      error: {
        message: "Dry-run job not found",
      },
    });

    expect(result).toEqual({
      success: false,
      error: "Dry-run job not found",
    });
  });
});
