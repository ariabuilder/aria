import { beforeEach, describe, expect, it, vi } from "vitest";

const actionMocks = vi.hoisted(() => ({
  getTransformState: vi.fn(),
  saveProfile: vi.fn(),
  saveTransformVariant: vi.fn(),
  deleteTransformVariant: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: { media: actionMocks },
}));

vi.mock("vue-sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useMediaTransforms } from "../../admin/features/Studio/media/composables/useMediaTransforms";

const timestamp = "2026-07-14T14:00:00.000Z";
const profile = {
  assetPath: "/uploads/hero.jpg",
  currentSourceVersion: 1,
  altText: null,
  title: null,
  caption: null,
  credit: null,
  copyright: null,
  focalPoint: { x: 0.7, y: 0.4 },
  createdAt: timestamp,
  updatedAt: timestamp,
};
const variant = {
  id: "hero-square",
  assetPath: "/uploads/hero.jpg",
  name: "Square",
  sourceVersion: 1,
  crop: { x: 0.2, y: 0, width: 0.5, height: 1 },
  focalPoint: { x: 0.7, y: 0.4 },
  aspectRatio: { width: 1, height: 1 },
  output: { width: 800, height: 800, format: "webp" as const, quality: 100 },
  createdAt: timestamp,
  updatedAt: timestamp,
};

describe("useMediaTransforms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionMocks.getTransformState.mockResolvedValue({
      data: { profile: null, sourceVersions: [], variants: [] },
      error: undefined,
    });
    actionMocks.saveTransformVariant.mockResolvedValue({
      data: { profile, variant },
      error: undefined,
    });
    actionMocks.saveProfile.mockResolvedValue({
      data: { ...profile, altText: "Hero image" },
      error: undefined,
    });
  });

  it("adopts the profile created by the first crop before metadata saves", async () => {
    const transforms = useMediaTransforms();
    await transforms.load(profile.assetPath);

    expect(transforms.state.value?.profile).toBeNull();
    await transforms.saveVariant({
      id: variant.id,
      assetPath: variant.assetPath,
      name: variant.name,
      sourceVersion: variant.sourceVersion,
      crop: variant.crop,
      focalPoint: variant.focalPoint,
      aspectRatio: variant.aspectRatio,
      output: variant.output,
      expectedUpdatedAt: null,
    });

    expect(transforms.state.value?.profile).toEqual(profile);
    await transforms.saveProfile({
      assetPath: profile.assetPath,
      currentSourceVersion: 1,
      altText: "Hero image",
      title: null,
      caption: null,
      credit: null,
      copyright: null,
      focalPoint: profile.focalPoint,
      expectedUpdatedAt: transforms.state.value?.profile?.updatedAt ?? null,
    });

    expect(actionMocks.saveProfile).toHaveBeenCalledWith(
      expect.objectContaining({ expectedUpdatedAt: timestamp }),
    );
  });
});
