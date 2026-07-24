import { beforeEach, describe, expect, it, vi } from "vitest";

const { initMock, listInventoryMock, traceStartupMock } = vi.hoisted(() => ({
  initMock: vi.fn(),
  listInventoryMock: vi.fn(),
  traceStartupMock: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: {
    init: (...args: unknown[]) => initMock(...args),
    pages: {
      listInventory: (...args: unknown[]) => listInventoryMock(...args),
    },
  },
}));

vi.mock("@/lib/startupTrace", () => ({
  traceStartup: (...args: unknown[]) => traceStartupMock(...args),
}));

describe("useBuilderData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  it("rejects malformed init payloads before mutating singleton builder data", async () => {
    initMock.mockResolvedValue({
      data: {
        pages: {},
        layouts: [],
        components: [],
      },
      error: null,
    });

    const { useBuilderData } =
      await import("../../admin/composables/useBuilderData");

    const builderData = useBuilderData();

    await expect(
      builderData.fetchBuilderData({ force: true, silent: true }),
    ).rejects.toThrow("Invalid response structure from init action");

    expect(builderData.pages.value).toEqual([]);
    expect(builderData.layouts.value).toEqual([]);
    expect(builderData.components.value).toEqual([]);
    expect(builderData.isInitialized.value).toBe(false);
    expect(builderData.error.value).toBe(
      "Invalid response structure from init action",
    );
  });

  it("rejects malformed builder item payloads before mutating singleton builder data", async () => {
    initMock.mockResolvedValue({
      data: {
        pages: [
          {
            id: "home",
            title: "Home",
            slug: "home",
            status: "draft",
            layout: null,
            updatedAt: null,
          },
        ],
        layouts: [],
        components: [
          {
            id: "hero",
            name: 42,
          },
        ],
      },
      error: null,
    });

    const { useBuilderData } =
      await import("../../admin/composables/useBuilderData");

    const builderData = useBuilderData();

    await expect(
      builderData.fetchBuilderData({ force: true, silent: true }),
    ).rejects.toThrow("Invalid response structure from init action");

    expect(builderData.pages.value).toEqual([]);
    expect(builderData.layouts.value).toEqual([]);
    expect(builderData.components.value).toEqual([]);
    expect(builderData.isInitialized.value).toBe(false);
    expect(builderData.error.value).toBe(
      "Invalid response structure from init action",
    );
  });

  it("refreshes pages through the pages inventory action without reloading layouts or components", async () => {
    initMock.mockResolvedValue({
      data: {
        pages: [
          {
            id: "home",
            title: "Home",
            slug: "index",
            status: "draft",
            layout: "shell",
            updatedAt: null,
          },
        ],
        layouts: [
          {
            id: "shell",
            name: "Shell",
            updatedAt: null,
          },
        ],
        components: [
          {
            id: "hero",
            name: "Hero",
            updatedAt: null,
          },
        ],
      },
      error: null,
    });
    listInventoryMock.mockResolvedValue({
      data: {
        pages: [
          {
            id: "about",
            title: "About",
            slug: "about",
            status: "published",
            layout: "shell",
            systemRole: "standard",
            accessMode: "password",
            hasPassword: true,
            updatedAt: "2026-04-04T00:00:00.000Z",
            snapshotUrl:
              "/admin/api/page-snapshots/about?stage=published&v=2026-04-04T00%3A00%3A00.000Z&sr=style-9",
            thumbnailUrl:
              "/admin/api/page-thumbnails/about?stage=published&v=2026-04-04T00%3A00%3A00.000Z&sr=style-9",
          },
        ],
      },
      error: null,
    });

    const { useBuilderData } =
      await import("../../admin/composables/useBuilderData");

    const builderData = useBuilderData();

    await builderData.fetchBuilderData({ force: true, silent: true });
    await builderData.refreshPagesNow();

    expect(initMock).toHaveBeenCalledTimes(1);
    expect(listInventoryMock).toHaveBeenCalledTimes(1);
    expect(builderData.pages.value).toEqual([
      expect.objectContaining({
        id: "about",
        slug: "about",
        status: "published",
        systemRole: "standard",
        accessMode: "password",
        hasPassword: true,
        snapshotUrl:
          "/admin/api/page-snapshots/about?stage=published&v=2026-04-04T00%3A00%3A00.000Z&sr=style-9",
        thumbnailUrl:
          "/admin/api/page-thumbnails/about?stage=published&v=2026-04-04T00%3A00%3A00.000Z&sr=style-9",
      }),
    ]);
    expect(builderData.layouts.value).toEqual([
      expect.objectContaining({ id: "shell", name: "Shell" }),
    ]);
    expect(builderData.components.value).toEqual([
      expect.objectContaining({ id: "hero", name: "Hero" }),
    ]);
  });

  it("rejects malformed page inventory payloads before mutating existing page state", async () => {
    initMock.mockResolvedValue({
      data: {
        pages: [
          {
            id: "home",
            title: "Home",
            slug: "index",
            status: "draft",
            layout: "shell",
            updatedAt: null,
          },
        ],
        layouts: [],
        components: [],
      },
      error: null,
    });
    listInventoryMock.mockResolvedValue({
      data: {
        pages: {},
      },
      error: null,
    });

    const { useBuilderData } =
      await import("../../admin/composables/useBuilderData");

    const builderData = useBuilderData();

    await builderData.fetchBuilderData({ force: true, silent: true });

    await expect(builderData.refreshPagesNow()).rejects.toThrow(
      "Invalid response structure from page inventory action",
    );

    expect(builderData.pages.value).toEqual([
      expect.objectContaining({ id: "home", slug: "index" }),
    ]);
    expect(builderData.error.value).toBe(
      "Invalid response structure from page inventory action",
    );
  });

  it("skips refreshComponents while builder data is still fresh", async () => {
    const nowSpy = vi.spyOn(Date, "now");

    initMock.mockResolvedValue({
      data: {
        pages: [],
        layouts: [],
        components: [{ id: "hero", name: "Hero", source: "custom", updatedAt: null }],
      },
      error: null,
    });

    nowSpy.mockReturnValue(1_000);

    const { useBuilderData } =
      await import("../../admin/composables/useBuilderData");

    const builderData = useBuilderData();
    await builderData.fetchBuilderData({ force: true, silent: true });

    nowSpy.mockReturnValue(1_100);
    await builderData.refreshComponents();

    expect(initMock).toHaveBeenCalledTimes(1);

    nowSpy.mockRestore();
  });

  it("refreshComponentsNow always re-fetches builder data", async () => {
    const nowSpy = vi.spyOn(Date, "now");

    initMock.mockResolvedValue({
      data: {
        pages: [],
        layouts: [],
        components: [{ id: "hero", name: "Hero", source: "custom", updatedAt: null }],
      },
      error: null,
    });

    nowSpy.mockReturnValue(1_000);

    const { useBuilderData } =
      await import("../../admin/composables/useBuilderData");

    const builderData = useBuilderData();
    await builderData.fetchBuilderData({ force: true, silent: true });

    initMock.mockResolvedValue({
      data: {
        pages: [],
        layouts: [],
        components: [],
      },
      error: null,
    });

    nowSpy.mockReturnValue(1_100);
    await builderData.refreshComponentsNow();

    expect(initMock).toHaveBeenCalledTimes(2);
    expect(builderData.components.value).toEqual([]);

    nowSpy.mockRestore();
  });

  it("skips the pages inventory refresh while the page list is still fresh", async () => {
    const nowSpy = vi.spyOn(Date, "now");

    initMock.mockResolvedValue({
      data: {
        pages: [
          {
            id: "home",
            title: "Home",
            slug: "index",
            status: "draft",
            layout: "shell",
            updatedAt: null,
          },
        ],
        layouts: [],
        components: [],
      },
      error: null,
    });

    nowSpy.mockReturnValue(1_000);

    const { useBuilderData } =
      await import("../../admin/composables/useBuilderData");

    const builderData = useBuilderData();
    await builderData.fetchBuilderData({ force: true, silent: true });

    nowSpy.mockReturnValue(1_100);
    await builderData.refreshPages();

    expect(listInventoryMock).not.toHaveBeenCalled();
  });

  it("applyOptimisticPageRemoval removes pages immediately and can roll back", async () => {
    initMock.mockResolvedValue({
      data: {
        pages: [
          {
            id: "home",
            title: "Home",
            slug: "home",
            status: "draft",
            updatedAt: null,
          },
          {
            id: "about",
            title: "About",
            slug: "about",
            status: "draft",
            updatedAt: null,
          },
        ],
        layouts: [],
        components: [],
      },
      error: null,
    });

    const { useBuilderData } =
      await import("../../admin/composables/useBuilderData");

    const builderData = useBuilderData();
    await builderData.fetchBuilderData({ force: true, silent: true });

    const rollback = builderData.applyOptimisticPageRemoval(["about"]);
    expect(builderData.pages.value.map((page) => page.slug)).toEqual(["home"]);

    rollback();
    expect(builderData.pages.value.map((page) => page.slug)).toEqual([
      "home",
      "about",
    ]);
  });

  it("preserves scheduled status and scheduledFor from init payloads", async () => {
    initMock.mockResolvedValue({
      data: {
        pages: [
          {
            id: "launch",
            title: "Launch",
            slug: "launch",
            status: "scheduled",
            scheduledFor: "2026-08-01T12:00:00.000Z",
            layout: "shell",
            updatedAt: "2026-07-01T00:00:00.000Z",
          },
        ],
        layouts: [],
        components: [],
      },
      error: null,
    });

    const { useBuilderData } =
      await import("../../admin/composables/useBuilderData");

    const builderData = useBuilderData();
    await builderData.fetchBuilderData({ force: true, silent: true });

    expect(builderData.pages.value[0]).toMatchObject({
      slug: "launch",
      status: "scheduled",
      scheduledFor: "2026-08-01T12:00:00.000Z",
    });
  });
});
