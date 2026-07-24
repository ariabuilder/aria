import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  listMock,
  uploadMock,
  deleteMock,
  renameMock,
  recordMediaEventMock,
  executeMediaHistoryMock,
  loggerMock,
} = vi.hoisted(() => ({
  listMock: vi.fn(),
  uploadMock: vi.fn(),
  deleteMock: vi.fn(),
  renameMock: vi.fn(),
  recordMediaEventMock: vi.fn(),
  executeMediaHistoryMock: vi.fn(),
  loggerMock: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: {
    media: {
      list: listMock,
      upload: uploadMock,
      delete: deleteMock,
      rename: renameMock,
    },
  },
}));

vi.mock("@/lib/utils/logger", () => ({
  log: loggerMock,
}));

vi.mock("vue-sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("../../admin/features/Studio/media/composables/useMediaHistory", () => ({
  useMediaHistory: () => ({
    recordMediaEvent: recordMediaEventMock,
    executeMediaHistory: executeMediaHistoryMock,
  }),
}));

describe("useMediaAssets", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    recordMediaEventMock.mockResolvedValue({ success: true });
    executeMediaHistoryMock.mockImplementation(async (input) => {
      await input.redo?.();
      return { success: true };
    });
  });

  const validAsset = {
    id: "uploads/logo.png",
    name: "logo.png",
    type: "image" as const,
    url: "/uploads/logo.png",
    size: 42,
  };

  it("uses the shared cache while the media list is fresh", async () => {
    const { useMediaAssets } =
      await import("../../admin/features/Studio/media/composables/useMediaAssets");

    listMock.mockResolvedValue({
      data: [validAsset],
      error: null,
    });

    const media = useMediaAssets();
    await media.loadAssets();
    await media.loadAssets();

    expect(listMock).toHaveBeenCalledTimes(1);
    expect(media.assets.value).toEqual([validAsset]);
  });

  it("dedupes overlapping media list requests", async () => {
    const { useMediaAssets } =
      await import("../../admin/features/Studio/media/composables/useMediaAssets");

    let resolveList!: (value: unknown) => void;
    listMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveList = resolve;
        }),
    );

    const media = useMediaAssets();
    const firstLoad = media.loadAssets({ force: true });
    const secondLoad = media.loadAssets();

    resolveList({
      data: [validAsset],
      error: null,
    });

    await Promise.all([firstLoad, secondLoad]);

    expect(listMock).toHaveBeenCalledTimes(1);
    expect(media.assets.value).toEqual([validAsset]);
  });

  it("retains cached assets after a transient list failure", async () => {
    const { useMediaAssets } =
      await import("../../admin/features/Studio/media/composables/useMediaAssets");

    listMock.mockResolvedValueOnce({
      data: [validAsset],
      error: null,
    });
    listMock.mockResolvedValueOnce({
      data: null,
      error: { code: "INTERNAL_SERVER_ERROR", message: "Failed" },
    });

    const media = useMediaAssets();
    await media.loadAssets({ force: true });
    await media.loadAssets({ force: true });

    expect(media.assets.value).toEqual([validAsset]);
  });

  it("clears cached assets after a forbidden list failure", async () => {
    const { useMediaAssets } =
      await import("../../admin/features/Studio/media/composables/useMediaAssets");

    listMock.mockResolvedValueOnce({
      data: [validAsset],
      error: null,
    });
    listMock.mockResolvedValueOnce({
      data: null,
      error: { code: "FORBIDDEN", message: "Forbidden" },
    });

    const media = useMediaAssets();
    await media.loadAssets({ force: true });
    await media.loadAssets({ force: true });

    expect(media.assets.value).toEqual([]);
  });

  it("rejects malformed media list payloads before mutating asset state", async () => {
    const { useMediaAssets } =
      await import("../../admin/features/Studio/media/composables/useMediaAssets");

    listMock.mockResolvedValue({
      data: [
        {
          id: "uploads/logo.png",
          type: "image",
          url: "/uploads/logo.png",
          size: 42,
        },
      ],
      error: null,
    });

    const media = useMediaAssets();
    await media.loadAssets({ force: true });

    expect(media.assets.value).toEqual([]);
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[Media] Invalid media list payload",
      expect.objectContaining({
        source: "useMediaAssets.loadAssets",
        issues: expect.any(Array),
      }),
    );
  });

  it("records rename failure when the rename action returns an invalid payload", async () => {
    const { useMediaAssets, resetMediaAssetsCacheForTests } =
      await import("../../admin/features/Studio/media/composables/useMediaAssets");

    renameMock.mockResolvedValue({
      data: { success: true, newPath: 42 },
      error: null,
    });
    listMock.mockResolvedValue({ data: [], error: null });

    const media = useMediaAssets();
    const asset = {
      id: "logo.png",
      name: "logo.png",
      type: "image" as const,
      url: "/uploads/logo.png",
      size: 42,
    };

    resetMediaAssetsCacheForTests();
    media.assets.value = [asset];

    await media.handleRename(asset);
    media.renameInput.value = "logo-renamed";
    await media.confirmRename();

    await vi.waitFor(() => {
      expect(renameMock).toHaveBeenCalledWith({
        oldPath: "logo.png",
        newName: "logo-renamed.png",
      });
    });

    await vi.waitFor(() => {
      expect(recordMediaEventMock).toHaveBeenCalledWith({
        type: "media-rename-failed",
        description: "Rename failed: logo.png → logo-renamed.png",
        affectedNodeIds: ["logo.png"],
      });
    });

    expect(media.isRenameDialogOpen.value).toBe(false);
    expect(media.assets.value[0]?.name).toBe("logo.png");
  });

  it("records upload failure when the upload action returns an invalid payload", async () => {
    const { useMediaAssets } =
      await import("../../admin/features/Studio/media/composables/useMediaAssets");

    uploadMock.mockResolvedValue({
      data: { success: true, url: 42 },
      error: null,
    });
    listMock.mockResolvedValue({ data: [], error: null });

    const input = {
      type: "",
      multiple: false,
      accept: "",
      onchange: null as ((event: Event) => unknown) | null,
      click: vi.fn(),
    } as unknown as HTMLInputElement;

    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, "createElement")
      .mockImplementation(((tagName: string) => {
        if (tagName === "input") {
          return input;
        }

        return originalCreateElement(tagName);
      }) as typeof document.createElement);

    const media = useMediaAssets();
    const file = new File(["hello"], "brand-font.woff2", {
      type: "font/woff2",
    });

    try {
      await media.handleUpload();
      await input.onchange?.({
        target: { files: [file] },
      } as unknown as Event);
    } finally {
      createElementSpy.mockRestore();
    }

    expect(uploadMock).toHaveBeenCalledWith(expect.any(FormData));
    expect(recordMediaEventMock).toHaveBeenCalledWith({
      type: "media-upload-failed",
      description: "Upload failed: brand-font.woff2",
    });
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[Media] Invalid upload payload",
      expect.objectContaining({
        source: "useMediaAssets.handleUpload",
        fileName: "brand-font.woff2",
        issues: expect.any(Array),
      }),
    );
  });

  it("records upload failure when the upload action rejects a too-large file", async () => {
    const { useMediaAssets } =
      await import("../../admin/features/Studio/media/composables/useMediaAssets");

    uploadMock.mockResolvedValue({
      data: undefined,
      error: {
        code: "CONTENT_TOO_LARGE",
        status: 413,
        message: "Request body too large",
      },
    });
    listMock.mockResolvedValue({ data: [], error: null });

    const input = {
      type: "",
      multiple: false,
      accept: "",
      onchange: null as ((event: Event) => unknown) | null,
      click: vi.fn(),
    } as unknown as HTMLInputElement;

    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, "createElement")
      .mockImplementation(((tagName: string) => {
        if (tagName === "input") {
          return input;
        }

        return originalCreateElement(tagName);
      }) as typeof document.createElement);

    const media = useMediaAssets();
    const file = new File(["hello"], "large-photo.jpg", {
      type: "image/jpeg",
    });

    try {
      await media.handleUpload();
      await input.onchange?.({
        target: { files: [file] },
      } as unknown as Event);
    } finally {
      createElementSpy.mockRestore();
    }

    const description =
      "Upload failed: large-photo.jpg is too large. Maximum size is 50 MB.";

    expect(recordMediaEventMock).toHaveBeenCalledWith({
      type: "media-upload-failed",
      description,
    });
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[Media] Upload failed",
      expect.objectContaining({
        source: "useMediaAssets.handleUpload",
        fileName: "large-photo.jpg",
        code: "CONTENT_TOO_LARGE",
        status: 413,
      }),
    );
    expect(loggerMock).toHaveBeenCalledWith(
      "error",
      "[MediaView] Upload error",
      expect.objectContaining({
        fileName: "large-photo.jpg",
        error: description,
      }),
    );
  });

  it("records delete failure when the delete action returns an invalid payload", async () => {
    const { useMediaAssets } =
      await import("../../admin/features/Studio/media/composables/useMediaAssets");

    deleteMock.mockResolvedValue({
      data: { success: "yes" },
      error: null,
    });
    listMock.mockResolvedValue({
      data: [
        {
          id: "logo.png",
          name: "logo.png",
          type: "image",
          url: "/uploads/logo.png",
          size: 42,
        },
      ],
      error: null,
    });

    const media = useMediaAssets();
    const asset = {
      id: "logo.png",
      name: "logo.png",
      type: "image" as const,
      url: "/uploads/logo.png",
      size: 42,
    };

    await media.handleDelete(asset);
    await media.confirmDelete();

    await vi.waitFor(() => {
      expect(deleteMock).toHaveBeenCalledWith({
        path: "logo.png",
      });
    });

    await vi.waitFor(() => {
      expect(recordMediaEventMock).toHaveBeenCalledWith({
        type: "media-delete-failed",
        description: "Delete failed: logo.png",
        affectedNodeIds: ["logo.png"],
      });
    });

    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[Media] Invalid delete response payload",
      expect.objectContaining({
        source: "useMediaAssets.handleDelete",
        path: "logo.png",
        issues: expect.any(Array),
      }),
    );
    expect(media.isDeleteDialogOpen.value).toBe(true);
  });
});
