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

import {
  requireCapability,
  requireOperation,
  resolveUserPermissionProfile,
} from "../../../lib/auth";
import type { SessionUser } from "../../../lib/auth/types";
import { resolveEffectiveCapabilities } from "../../../lib/auth/types";

const contributor: SessionUser = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "contributor",
  email: "contributor@example.com",
  role: "contributor",
  totpEnabled: false,
};

const contributorWithPublishOverride: SessionUser = {
  ...contributor,
  permissionProfile: {
    rolePreset: "contributor",
    capabilityOverrides: { allow: ["publishContent"] },
  },
};

const administrator: SessionUser = {
  id: "22222222-2222-4222-8222-222222222222",
  username: "admin",
  email: "admin@example.com",
  role: "administrator",
  totpEnabled: false,
};

function createContext(user: SessionUser | null) {
  return {
    cookies: {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      has: vi.fn(),
      headers: vi.fn(),
    },
    locals: user ? { user } : {},
  } as never;
}

describe("requireCapability", () => {
  it("allows CMS capability for contributor preset", async () => {
    const user = await requireCapability(createContext(contributor), "editCms");
    expect(user.id).toBe(contributor.id);
  });

  it("denies page content capability for contributor preset", async () => {
    await expect(
      requireCapability(createContext(contributor), "editPageContent"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies missing capability", async () => {
    await expect(
      requireCapability(createContext(contributor), "publishContent"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("honors allow overrides", async () => {
    const user = await requireCapability(
      createContext(contributorWithPublishOverride),
      "publishContent",
    );
    expect(user.permissionProfile?.capabilityOverrides?.allow).toContain(
      "publishContent",
    );
  });
});

describe("requireOperation", () => {
  it("allows CMS install for contributor preset", async () => {
    const user = await requireOperation(
      createContext(contributor),
      "library.installComponent",
    );
    expect(user.role).toBe("contributor");
  });

  it("allows media list for contributor preset", async () => {
    const user = await requireOperation(createContext(contributor), "media.list");
    expect(user.role).toBe("contributor");
  });

  it("denies page save for contributor preset", async () => {
    await expect(
      requireOperation(createContext(contributor), "save.page"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies node mutate for contributor preset", async () => {
    await expect(
      requireOperation(createContext(contributor), "nodes.mutate"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies media delete for contributor preset", async () => {
    await expect(
      requireOperation(createContext(contributor), "media.delete"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies operations when no mapped capability matches", async () => {
    await expect(
      requireOperation(createContext(contributor), "publishing.publish"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("fails closed for unmapped operations", async () => {
    await expect(
      requireOperation(createContext(contributor), "unknown.operation"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("resolveUserPermissionProfile", () => {
  it("falls back to role preset when permissionProfile is absent", () => {
    expect(resolveUserPermissionProfile(contributor)).toEqual({
      rolePreset: "contributor",
    });
  });

  it("reconciles stale permissionProfile.rolePreset with session role", () => {
    const adminWithStaleProfile: SessionUser = {
      ...administrator,
      role: "administrator",
      permissionProfile: {
        rolePreset: "manager",
      },
    };

    expect(resolveUserPermissionProfile(adminWithStaleProfile)).toEqual({
      rolePreset: "administrator",
    });
    expect(
      resolveEffectiveCapabilities(
        resolveUserPermissionProfile(adminWithStaleProfile),
      ),
    ).toContain("manageSecurity");
  });

  it("preserves capability overrides when reconciling stale rolePreset", () => {
    const adminWithDeny: SessionUser = {
      ...administrator,
      role: "administrator",
      permissionProfile: {
        rolePreset: "manager",
        capabilityOverrides: { deny: ["manageSecurity"] },
      },
    };

    expect(
      resolveEffectiveCapabilities(resolveUserPermissionProfile(adminWithDeny)),
    ).not.toContain("manageSecurity");
  });
});
