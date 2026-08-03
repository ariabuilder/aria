import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StorageAdapter } from "../../lib/storage/adapter";
import type { ComponentDSL, LayoutDSL, PageDSL } from "../../lib/types/nodes";
import { buildAuthorshipSaveContext } from "../../lib/authorship/stamping";
import type { SessionUser } from "../../lib/auth";

const {
  deliverContentRevisionForActionMock,
  touchContentRevisionForActionMock,
  touchContentRevisionMock,
} = vi.hoisted(() => ({
  deliverContentRevisionForActionMock: vi.fn(),
  touchContentRevisionForActionMock: vi.fn(),
  touchContentRevisionMock: vi.fn(),
}));

vi.mock("../../lib/content-sync/mutations", () => ({
  deliverContentRevisionForAction: deliverContentRevisionForActionMock,
  touchContentRevisionForAction: touchContentRevisionForActionMock,
  touchContentRevision: touchContentRevisionMock,
}));

import { saveResource } from "../../actions/_shared";

const actor: SessionUser = {
  id: "22222222-2222-4222-8222-222222222222",
  username: "editor",
  email: "editor@example.com",
  role: "content-editor",
  totpEnabled: false,
};

const component: ComponentDSL = {
  id: "header",
  name: "Header",
  nodes: [],
};

const page: PageDSL = {
  id: "home",
  slug: "home",
  title: "Home",
  status: "draft",
  nodes: [],
};

const layout: LayoutDSL = {
  id: "default",
  name: "Default",
  slots: [{ name: "main", label: "Main", isDefault: true }],
  nodes: [],
};

describe("shared resource save lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    touchContentRevisionMock.mockResolvedValue({
      scope: "default",
      currentRevisionId: "revision-42",
      revisionSeq: 42,
      updatedAt: "2026-08-02T23:00:00.000Z",
      lastMutationKind: "save-component",
      lastMutationTarget: "header",
    });
    deliverContentRevisionForActionMock.mockResolvedValue(undefined);
  });

  it("returns a committed Cloudflare save before Studio delivery completes", async () => {
    let resolveDelivery: (() => void) | undefined;
    const delivery = new Promise<void>((resolve) => {
      resolveDelivery = resolve;
    });
    deliverContentRevisionForActionMock.mockReturnValueOnce(delivery);
    const waitUntil = vi.fn();
    const saveComponentDSL = vi.fn().mockResolvedValue("component-v2");
    const adapter = { saveComponentDSL } as unknown as StorageAdapter;

    await expect(
      saveResource(
        adapter,
        { locals: { user: actor, cfContext: { waitUntil } } },
        "components",
        component.id,
        component,
        buildAuthorshipSaveContext(actor, "save-component"),
        { versionSaveOptions: { expectedVersion: "component-v1" } },
      ),
    ).resolves.toBe("component-v2");

    expect(saveComponentDSL).toHaveBeenCalledOnce();
    expect(touchContentRevisionMock).toHaveBeenCalledOnce();
    expect(deliverContentRevisionForActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ revisionSeq: 42 }),
      { mutationKind: "save-component", mutationTarget: "header" },
      expect.anything(),
      { purgePublicPages: false },
    );
    expect(waitUntil).toHaveBeenCalledOnce();

    resolveDelivery?.();
    await expect(waitUntil.mock.calls[0]?.[0]).resolves.toBeUndefined();
  });

  it("awaits the same delivery contract outside Cloudflare", async () => {
    let resolveDelivery: (() => void) | undefined;
    const delivery = new Promise<void>((resolve) => {
      resolveDelivery = resolve;
    });
    deliverContentRevisionForActionMock.mockReturnValueOnce(delivery);
    const adapter = {
      saveComponentDSL: vi.fn().mockResolvedValue("component-v2"),
    } as unknown as StorageAdapter;

    let settled = false;
    const save = saveResource(
      adapter,
      { locals: { user: actor } },
      "components",
      component.id,
      component,
      buildAuthorshipSaveContext(actor, "save-component"),
    ).then((version) => {
      settled = true;
      return version;
    });

    await Promise.resolve();
    expect(settled).toBe(false);
    resolveDelivery?.();
    await expect(save).resolves.toBe("component-v2");
  });

  it("does not turn a committed save into a failure when revision tracking fails", async () => {
    touchContentRevisionMock.mockRejectedValueOnce(
      new Error("revision backend unavailable"),
    );
    const saveComponentDSL = vi.fn().mockResolvedValue("component-v2");
    const adapter = { saveComponentDSL } as unknown as StorageAdapter;

    await expect(
      saveResource(
        adapter,
        { locals: { user: actor } },
        "components",
        component.id,
        component,
        buildAuthorshipSaveContext(actor, "save-component"),
      ),
    ).resolves.toBe("component-v2");

    expect(saveComponentDSL).toHaveBeenCalledOnce();
    expect(deliverContentRevisionForActionMock).not.toHaveBeenCalled();
  });

  it.each([
    {
      collection: "pages" as const,
      resource: page,
      mutationKind: "save-page" as const,
      saveMethod: "savePageDSL" as const,
      version: "page-v2",
    },
    {
      collection: "layouts" as const,
      resource: layout,
      mutationKind: "save-layout" as const,
      saveMethod: "saveLayoutDSL" as const,
      version: "layout-v2",
    },
  ])(
    "defers $collection delivery after the durable revision",
    async ({ collection, resource, mutationKind, saveMethod, version }) => {
      const waitUntil = vi.fn();
      const adapter = {
        [saveMethod]: vi.fn().mockResolvedValue(version),
      } as unknown as StorageAdapter;

      await expect(
        saveResource(
          adapter,
          { locals: { user: actor, cfContext: { waitUntil } } },
          collection,
          resource.id,
          resource,
          buildAuthorshipSaveContext(actor, mutationKind),
        ),
      ).resolves.toBe(version);

      expect(touchContentRevisionMock).toHaveBeenCalledWith(
        adapter,
        { mutationKind, mutationTarget: resource.id },
        expect.anything(),
      );
      expect(deliverContentRevisionForActionMock).toHaveBeenCalledWith(
        expect.objectContaining({ revisionSeq: 42 }),
        { mutationKind, mutationTarget: resource.id },
        expect.anything(),
        { purgePublicPages: false },
      );
      expect(waitUntil).toHaveBeenCalledOnce();
      await expect(waitUntil.mock.calls[0]?.[0]).resolves.toBeUndefined();
    },
  );
});
