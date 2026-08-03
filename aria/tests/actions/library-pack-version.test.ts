import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ComponentDSL, PackManifest } from "../../lib/types/nodes";
import { getActionHandler } from "../helpers/actionHandler";

const { getComponentDSLMock, saveComponentDSLMock, touchContentRevisionMock } =
  vi.hoisted(() => ({
    getComponentDSLMock: vi.fn(),
    saveComponentDSLMock: vi.fn(),
    touchContentRevisionMock: vi.fn(),
  }));

const { manifest, payload, starterManifest } = vi.hoisted(() => {
  const packManifest: PackManifest = {
    id: "test-pack",
    name: "Test Pack",
    version: "2.0.0",
    tier: "free",
    componentIds: ["valid", "invalid"],
    publishedAt: "2026-08-02T00:00:00.000Z",
  };
  return {
    manifest: packManifest,
    starterManifest: {
      id: "aria-free-pack",
      name: "Starter Button Pack",
      version: "3.2.1",
      tier: "free" as const,
      componentIds: ["aria.button"],
      publishedAt: "2026-08-02T00:00:00.000Z",
    },
    payload: {
      manifest: packManifest,
      components: [
        { id: "valid", name: "valid", nodes: [] },
        {
          id: "invalid",
          name: "invalid",
          nodes: [
            {
              id: "invalid-icon",
              type: "icon",
              props: { icon: { id: "not-canonical", pack: "lucide" } },
              styles: {},
              children: [],
            },
          ],
        },
      ],
    },
  };
});

const validComponent = (id: string): ComponentDSL => ({
  id,
  name: id,
  nodes: [],
});

vi.mock("../../lib/registry/seed", () => ({
  SEEDED_REGISTRY_MANIFEST: {
    schemaVersion: "1",
    updatedAt: "2026-08-02T00:00:00.000Z",
    packs: [manifest, starterManifest],
  },
  getSeededPayload: vi.fn(() => payload),
}));

vi.mock("../../lib/storage/getStorageAdapter", () => ({
  getStorageAdapterAsync: vi.fn(async () => ({
    getComponentDSL: getComponentDSLMock,
    listComponentsDSL: vi.fn(async () => []),
    saveComponentDSL: saveComponentDSLMock,
  })),
}));

vi.mock("../../lib/registry/verification", () => ({
  OFFICIAL_PACK_SIGNERS: {},
  verifyPackSignature: vi.fn(async () => ({ success: true })),
  verifyPayloadChecksum: vi.fn(async () => ({ success: true })),
}));

vi.mock("../../lib/content-sync/mutations", () => ({
  touchContentRevisionForAction: touchContentRevisionMock,
}));

vi.mock("../../actions/_shared", () => ({
  requireAuth: vi.fn(),
  requireOperation: vi.fn(),
  resolveAuthorizedMutation: vi.fn(async () => ({ authorship: {} })),
}));

describe("library pack versions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getComponentDSLMock.mockResolvedValue(null);
  });

  it("prefers the seeded starter-pack semver over the component revision", async () => {
    const { resolveStarterButtonPackVersion } =
      await import("../../actions/library");

    expect(resolveStarterButtonPackVersion()).toBe(starterManifest.version);
  });

  it("reports the lowest valid installed pack version", async () => {
    const { resolveInstalledPackVersion } =
      await import("../../actions/library");

    expect(
      resolveInstalledPackVersion([
        { ...validComponent("one"), packVersion: "2.1.0" },
        { ...validComponent("two"), packVersion: "1.9.0" },
        { ...validComponent("three"), packVersion: "2.0.0" },
      ]),
    ).toBe("1.9.0");
  });

  it("reports unknown when any installed component lacks valid metadata", async () => {
    const { resolveInstalledPackVersion } =
      await import("../../actions/library");

    expect(
      resolveInstalledPackVersion([
        { ...validComponent("one"), packVersion: "2.1.0" },
        validComponent("legacy"),
      ]),
    ).toBe("unknown");
    expect(
      resolveInstalledPackVersion([
        { ...validComponent("one"), packVersion: "not-semver" },
      ]),
    ).toBe("unknown");
  });

  it("omits unknown catalog versions and conservatively offers updates", async () => {
    const { resolveCatalogPackVersionState } =
      await import("../../actions/library");

    expect(resolveCatalogPackVersionState("2.0.0", "unknown")).toEqual({
      updateAvailable: true,
    });
    expect(resolveCatalogPackVersionState("2.0.0", "1.5.0")).toEqual({
      installedVersion: "1.5.0",
      updateAvailable: true,
    });
    expect(resolveCatalogPackVersionState("2.0.0")).toEqual({
      updateAvailable: false,
    });
  });

  it("normalizes the complete pack before its first save or revision touch", async () => {
    const { library } = await import("../../actions/library");

    await expect(
      getActionHandler(library.installPack)(
        { packId: manifest.id, force: false },
        { locals: {} } as never,
      ),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "RENDER_INPUT_INVALID: The render input is invalid.",
    });

    expect(saveComponentDSLMock).not.toHaveBeenCalled();
    expect(touchContentRevisionMock).not.toHaveBeenCalled();
  });

  it("uses pack semver in already-installed responses", async () => {
    const { library } = await import("../../actions/library");
    getComponentDSLMock.mockResolvedValue({
      ...validComponent("valid"),
      source: "aria",
      packId: manifest.id,
      packVersion: "1.8.0",
      version: "42",
    });

    await expect(
      getActionHandler(library.installComponent)(
        {
          packId: manifest.id,
          componentId: "valid",
          force: false,
        },
        { locals: {} } as never,
      ),
    ).resolves.toEqual({
      success: true,
      data: {
        packId: manifest.id,
        componentId: "valid",
        version: "1.8.0",
        action: "already_installed",
      },
    });
    expect(saveComponentDSLMock).not.toHaveBeenCalled();
  });
});
