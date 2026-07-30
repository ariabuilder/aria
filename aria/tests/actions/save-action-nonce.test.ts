import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  assertPageLayoutChangeAllowedMock,
  consumeNonceMock,
  generateNonceMock,
  getAdapterMock,
  getResourceMock,
  invalidateComposeCacheMock,
  invalidateDependentPageCachesMock,
  normalizeNodesIconsMock,
  resolveAuthorizedMutationMock,
  savePageSnapshotMock,
  saveResourceMock,
  storeNonceMock,
  validateNonceMock,
} = vi.hoisted(() => ({
  assertPageLayoutChangeAllowedMock: vi.fn(),
  consumeNonceMock: vi.fn(),
  generateNonceMock: vi.fn(),
  getAdapterMock: vi.fn(),
  getResourceMock: vi.fn(),
  invalidateComposeCacheMock: vi.fn(),
  invalidateDependentPageCachesMock: vi.fn(),
  normalizeNodesIconsMock: vi.fn(),
  resolveAuthorizedMutationMock: vi.fn(),
  savePageSnapshotMock: vi.fn(),
  saveResourceMock: vi.fn(),
  storeNonceMock: vi.fn(),
  validateNonceMock: vi.fn(),
}));

vi.mock("../../lib/utils/logger", () => ({
  log: vi.fn(),
}));

vi.mock("../../lib/icons/action-normalizers", () => ({
  normalizeNodesIcons: normalizeNodesIconsMock,
}));

vi.mock("../../lib/rendering/pageSnapshots", () => ({
  savePageSnapshot: savePageSnapshotMock,
}));

vi.mock("../../lib/pages/layoutPolicy.server", () => ({
  assertPageLayoutChangeAllowed: assertPageLayoutChangeAllowedMock,
}));

vi.mock("../../lib/pages/layoutPolicy", () => ({
  normalizePageLayoutRef: (layout: string | null | undefined) =>
    layout || undefined,
}));

vi.mock("../../actions/_shared", () => ({
  generateNonce: generateNonceMock,
  getAdapter: getAdapterMock,
  getResource: getResourceMock,
  invalidateComposeCache: invalidateComposeCacheMock,
  invalidateDependentPageCaches: invalidateDependentPageCachesMock,
  resolveAuthorizedMutation: resolveAuthorizedMutationMock,
  saveResource: saveResourceMock,
  storeNonce: storeNonceMock,
  validateNonce: validateNonceMock,
  consumeNonce: consumeNonceMock,
}));

describe("save action nonce handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    assertPageLayoutChangeAllowedMock.mockResolvedValue(undefined);
    generateNonceMock.mockReturnValue("nonce-next");
    getAdapterMock.mockResolvedValue({
      adapter: true,
      getPageVersionPins: vi.fn().mockResolvedValue({
        draftVersion: "v-current",
        publishedVersion: null,
        currentVersion: "v-current",
      }),
    });
    getResourceMock.mockResolvedValue({
      id: "home",
      slug: "home",
      title: "Home",
      nodes: [],
      layout: "default",
      status: "draft",
      version: "v-current",
    });
    invalidateComposeCacheMock.mockResolvedValue(undefined);
    invalidateDependentPageCachesMock.mockResolvedValue(undefined);
    normalizeNodesIconsMock.mockImplementation((nodes) => nodes);
    resolveAuthorizedMutationMock.mockResolvedValue({
      authorship: { mutationKind: "save-page", mutationTarget: "home" },
    });
    savePageSnapshotMock.mockResolvedValue(undefined);
    saveResourceMock.mockResolvedValue("v-next");
    storeNonceMock.mockResolvedValue(undefined);
    validateNonceMock.mockResolvedValue({ valid: true });
    consumeNonceMock.mockResolvedValue(undefined);
  });

  it("does not spend a nonce for an ordinary non-empty page save", async () => {
    const { save } = await import("../../actions/save");

    const result = await (save.page as any).handler(
      {
        id: "home",
        blocks: [{ id: "hero", type: "section", props: {}, children: [] }],
        layout: "default",
        nonce: "nonce-current",
      },
      { locals: {} } as never,
    );

    expect(result).toEqual({ version: "v-next" });
    expect(validateNonceMock).not.toHaveBeenCalled();
    expect(consumeNonceMock).not.toHaveBeenCalled();
    expect(storeNonceMock).not.toHaveBeenCalled();
  });

  it("accepts an expired nonce for an ordinary page save", async () => {
    const { save } = await import("../../actions/save");

    validateNonceMock.mockResolvedValue({
      valid: false,
      error: "Nonce validation failed",
    });

    await expect(
      (save.page as any).handler(
        {
          id: "home",
          blocks: [{ id: "hero", type: "section", props: {}, children: [] }],
          layout: "default",
          nonce: "nonce-current",
        },
        { locals: {} } as never,
      ),
    ).resolves.toEqual({ version: "v-next" });

    expect(saveResourceMock).toHaveBeenCalled();
    expect(validateNonceMock).not.toHaveBeenCalled();
    expect(consumeNonceMock).not.toHaveBeenCalled();
    expect(storeNonceMock).not.toHaveBeenCalled();
  });

  it("requires and consumes a nonce only for a destructive blank overwrite", async () => {
    const { save } = await import("../../actions/save");
    getResourceMock.mockResolvedValueOnce({
      id: "home",
      slug: "home",
      title: "Home",
      nodes: [{ id: "hero", type: "section", props: {}, children: [] }],
      layout: "default",
      status: "draft",
      version: "v-current",
    });

    await expect(
      (save.page as any).handler(
        { id: "home", blocks: [], layout: "default", nonce: "nonce-current" },
        { locals: {} } as never,
      ),
    ).resolves.toEqual({ version: "v-next" });

    expect(validateNonceMock).toHaveBeenCalledWith(
      expect.anything(),
      "home",
      "nonce-current",
    );
    expect(consumeNonceMock).toHaveBeenCalledWith(
      expect.anything(),
      "home",
      "nonce-current",
    );
    expect(storeNonceMock).not.toHaveBeenCalled();
  });

  it("rejects a stale Composer version before writing or consuming its nonce", async () => {
    const { save } = await import("../../actions/save");

    await expect(
      (save.page as any).handler(
        {
          id: "home",
          blocks: [{ id: "hero", type: "section", props: {}, children: [] }],
          layout: "default",
          nonce: "nonce-current",
          expectedVersion: "v-stale",
        },
        { locals: {} } as never,
      ),
    ).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
      message: "savePage:home failed: This draft is out of date. Reload it before saving.",
    });

    expect(saveResourceMock).not.toHaveBeenCalled();
    expect(consumeNonceMock).not.toHaveBeenCalled();
    expect(storeNonceMock).not.toHaveBeenCalled();
  });

  it("forwards the current Composer version to the storage save boundary", async () => {
    const { save } = await import("../../actions/save");

    await (save.page as any).handler(
      {
        id: "home",
        blocks: [{ id: "hero", type: "section", props: {}, children: [] }],
        layout: "default",
        nonce: "nonce-current",
        expectedVersion: "v-current",
      },
      { locals: {} } as never,
    );

    expect(saveResourceMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "pages",
      "home",
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        versionSaveOptions: { expectedVersion: "v-current" },
      }),
    );
  });

  it("returns the committed save when snapshot refresh fails afterward", async () => {
    const { save } = await import("../../actions/save");
    savePageSnapshotMock.mockRejectedValueOnce(new Error("snapshot unavailable"));

    await expect(
      (save.page as any).handler(
        {
          id: "home",
          blocks: [{ id: "hero", type: "section", props: {}, children: [] }],
          layout: "default",
          expectedVersion: "v-current",
        },
        { locals: {} } as never,
      ),
    ).resolves.toEqual({ version: "v-next" });
  });

  it("does not validate or consume a nonce when an ordinary save fails", async () => {
    const { save } = await import("../../actions/save");

    saveResourceMock.mockRejectedValue(new Error("storage failed"));

    await expect(
      (save.page as any).handler(
        {
          id: "home",
          blocks: [{ id: "hero", type: "section", props: {}, children: [] }],
          layout: "default",
          nonce: "nonce-current",
        },
        { locals: {} } as never,
      ),
    ).rejects.toThrow(/storage failed/);

    expect(validateNonceMock).not.toHaveBeenCalled();
    expect(consumeNonceMock).not.toHaveBeenCalled();
    expect(storeNonceMock).not.toHaveBeenCalled();
  });
});
