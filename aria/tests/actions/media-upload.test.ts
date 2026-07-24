import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "../../lib/auth/types";
import {
  MEDIA_TRANSFORM_INPUT_MAX_BYTES,
  MEDIA_UPLOAD_MAX_BYTES,
} from "../../lib/media/uploadLimits";

vi.mock("astro:actions", () => ({
  ActionError: class MockActionError extends Error {
    code: string;
    status: number;

    constructor(input: { code: string; message?: string }) {
      super(input.message);
      this.code = input.code;
      this.status = input.code === "CONTENT_TOO_LARGE" ? 413 : 500;
    }
  },
  defineAction: <T extends Record<string, unknown>>(config: T) => config,
}));

const mediaAdapter = vi.hoisted(() => ({
  saveMedia: vi.fn(),
  registerMediaSourceVersion: vi.fn(),
  upsertMediaCatalogAsset: vi.fn(),
}));

vi.mock("../../lib/storage/getStorageAdapter", () => ({
  getStorageAdapterAsync: vi.fn(async () => mediaAdapter),
}));

vi.mock("../../actions/_shared", () => ({
  buildAuthorshipSaveContext: vi.fn(),
  requireOperation: vi.fn(),
  resolveAuthorizedMediaMutation: vi.fn(async () => ({
    user: {
      id: "22222222-2222-4222-8222-222222222222",
      username: "manager",
      email: "manager@example.com",
      role: "manager",
      totpEnabled: false,
    },
    authorship: {
      actor: {
        id: "22222222-2222-4222-8222-222222222222",
        username: "manager",
        email: "manager@example.com",
      },
      mutationKind: "create",
    },
  })),
}));

const actor: SessionUser = {
  id: "22222222-2222-4222-8222-222222222222",
  username: "manager",
  email: "manager@example.com",
  role: "manager",
  totpEnabled: false,
};

function createContext() {
  return {
    locals: { user: actor },
  } as never;
}

function createFile(
  name: string,
  type: string,
  bytes: Uint8Array,
): File {
  return {
    name,
    type,
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.slice().buffer,
  } as File;
}

function createPng(): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0, 0, 0, 16, 0, 0, 0, 16], 16);
  return bytes;
}

describe("media.upload", () => {
  beforeEach(() => {
    mediaAdapter.saveMedia.mockReset();
    mediaAdapter.registerMediaSourceVersion.mockReset();
    mediaAdapter.upsertMediaCatalogAsset.mockReset();
    mediaAdapter.saveMedia.mockImplementation(
      async (path: string) => `/uploads/${path}`,
    );
    mediaAdapter.registerMediaSourceVersion.mockImplementation(
      async (input: unknown) => input,
    );
    mediaAdapter.upsertMediaCatalogAsset.mockResolvedValue({
      mediaId: "media-id",
      locationId: "location-id",
      logicalPath: "/uploads/uploaded-file",
    });
  });

  it("rejects files above the configured media upload limit", async () => {
    const { media } = await import("../../actions/media");
    const file = {
      name: "large-photo.jpg",
      size: MEDIA_UPLOAD_MAX_BYTES + 1,
      type: "image/jpeg",
    } as File;

    await expect(
      (media.upload as any).handler({ file }, createContext()),
    ).rejects.toMatchObject({
      code: "CONTENT_TOO_LARGE",
      message:
        "Upload failed: large-photo.jpg is too large. Maximum size is 50 MB.",
    });
  });

  it("rejects crop-enabled images above the Cloudflare transform limit", async () => {
    const { media } = await import("../../actions/media");
    const file = {
      name: "transform-too-large.webp",
      size: MEDIA_TRANSFORM_INPUT_MAX_BYTES + 1,
      type: "image/webp",
    } as File;

    await expect(
      (media.upload as any).handler({ file }, createContext()),
    ).rejects.toMatchObject({
      code: "CONTENT_TOO_LARGE",
      message:
        "Upload failed: transform-too-large.webp is too large for image cropping. Images must be 20 MB or smaller; other media can be up to 50 MB.",
    });
  });

  it("uploads SVG icons and indexes them without raster image inspection", async () => {
    const { media } = await import("../../actions/media");
    const file = createFile(
      "aria-icon.svg",
      "image/svg+xml",
      new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    );

    await expect(
      (media.upload as any).handler({ file }, createContext()),
    ).resolves.toMatchObject({
      success: true,
      type: "icon",
      url: expect.stringMatching(/^\/uploads\/aria-icon-[a-f0-9]{6}\.svg$/),
    });

    expect(mediaAdapter.saveMedia).toHaveBeenCalledTimes(1);
    expect(mediaAdapter.registerMediaSourceVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        mimeType: "image/svg+xml",
        width: null,
        height: null,
      }),
    );
  });

  it("keeps a stored PNG usable when its optional metadata write fails", async () => {
    const { media } = await import("../../actions/media");
    mediaAdapter.registerMediaSourceVersion.mockRejectedValueOnce(
      new Error("media metadata store unavailable"),
    );
    const file = createFile("aria-favicon-light.png", "image/png", createPng());

    await expect(
      (media.upload as any).handler({ file }, createContext()),
    ).resolves.toMatchObject({
      success: true,
      type: "image",
      url: expect.stringMatching(
        /^\/uploads\/aria-favicon-light-[a-f0-9]{6}\.png$/,
      ),
    });

    expect(mediaAdapter.saveMedia).toHaveBeenCalledTimes(2);
    expect(mediaAdapter.upsertMediaCatalogAsset).not.toHaveBeenCalled();
  });
});
