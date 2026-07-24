import { describe, expect, it, vi } from "vitest";

vi.mock("astro:actions", () => ({
  ActionError: class MockActionError extends Error {
    code: string;
    constructor(input: { code: string; message: string }) {
      super(input.message);
      this.code = input.code;
    }
  },
}));

import { requireOperation } from "../../lib/auth";
import type { SessionUser } from "../../lib/auth/types";

const contributor: SessionUser = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "contributor",
  email: "contributor@example.com",
  role: "contributor",
  totpEnabled: false,
};

const manager: SessionUser = {
  id: "33333333-3333-4333-8333-333333333333",
  username: "manager",
  email: "manager@example.com",
  role: "manager",
  totpEnabled: false,
};

function createContext(user: SessionUser) {
  return {
    cookies: {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      has: vi.fn(),
      headers: vi.fn(),
    },
    locals: { user },
  } as never;
}

describe("Phase 6 capability denial", () => {
  it("denies contributor crud.deleteItem", async () => {
    await expect(
      requireOperation(createContext(contributor), "crud.deleteItem"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies contributor publishing.publish", async () => {
    await expect(
      requireOperation(createContext(contributor), "publishing.publish"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies manager publish when publishContent is denied via override", async () => {
    const managerDeniedPublish: SessionUser = {
      ...manager,
      permissionProfile: {
        rolePreset: "manager",
        capabilityOverrides: { deny: ["publishContent"] },
      },
    };
    await expect(
      requireOperation(
        createContext(managerDeniedPublish),
        "publishing.publish",
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("Phase 8 capability denial", () => {
  const contentEditor: SessionUser = {
    id: "22222222-2222-4222-8222-222222222222",
    username: "editor",
    email: "editor@example.com",
    role: "content-editor",
    totpEnabled: false,
  };

  const phase8SyncOps = [
    "media.sync.plan",
    "contentSync.apply",
    "importExport.exportAll",
    "siteExport.create",
  ] as const;

  it.each(phase8SyncOps)("denies contributor %s", async (operationId) => {
    await expect(
      requireOperation(createContext(contributor), operationId),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it.each(phase8SyncOps)("denies content-editor %s", async (operationId) => {
    await expect(
      requireOperation(createContext(contentEditor), operationId),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it.each(phase8SyncOps)("allows manager %s", async (operationId) => {
    await expect(
      requireOperation(createContext(manager), operationId),
    ).resolves.toMatchObject({ role: "manager" });
  });

  it("allows contributor with syncMedia override", async () => {
    const contributorWithSync: SessionUser = {
      ...contributor,
      permissionProfile: {
        rolePreset: "contributor",
        capabilityOverrides: { allow: ["syncMedia"] },
      },
    };
    await expect(
      requireOperation(createContext(contributorWithSync), "media.sync.plan"),
    ).resolves.toMatchObject({ role: "contributor" });
  });
});

describe("layout and revert capability denial", () => {
  const contentEditor: SessionUser = {
    id: "22222222-2222-4222-8222-222222222222",
    username: "editor",
    email: "editor@example.com",
    role: "content-editor",
    totpEnabled: false,
  };

  it("denies content-editor pages.revertVersion", async () => {
    await expect(
      requireOperation(createContext(contentEditor), "pages.revertVersion"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows manager pages.revertVersion", async () => {
    await expect(
      requireOperation(createContext(manager), "pages.revertVersion"),
    ).resolves.toMatchObject({ role: "manager" });
  });

  it("denies content-editor pages.deleteVersion", async () => {
    await expect(
      requireOperation(createContext(contentEditor), "pages.deleteVersion"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows manager pages.deleteVersion", async () => {
    await expect(
      requireOperation(createContext(manager), "pages.deleteVersion"),
    ).resolves.toMatchObject({ role: "manager" });
  });

  it("allows content-editor pages.getVersions", async () => {
    await expect(
      requireOperation(createContext(contentEditor), "pages.getVersions"),
    ).resolves.toMatchObject({ role: "content-editor" });
  });

  it("allows content-editor pages.getPageMedia", async () => {
    await expect(
      requireOperation(createContext(contentEditor), "pages.getPageMedia"),
    ).resolves.toMatchObject({ role: "content-editor" });
  });

  it("allows content-editor crud.updateItem", async () => {
    await expect(
      requireOperation(createContext(contentEditor), "crud.updateItem"),
    ).resolves.toMatchObject({ role: "content-editor" });
  });
});
