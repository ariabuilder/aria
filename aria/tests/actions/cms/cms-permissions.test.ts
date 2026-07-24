import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("astro:actions", () => ({
  ActionError: class MockActionError extends Error {
    code: string;
    constructor(input: { code: string; message: string }) {
      super(input.message);
      this.code = input.code;
    }
  },
}));

import { requireOperation } from "../../../lib/auth";
import { OperationIdSchema } from "../../../lib/auth/capabilityOperations";
import type { SessionUser } from "../../../lib/auth/types";

const CmsEditOperationSchema = z.enum([
  "cms.collections.list",
  "cms.collections.get",
  "cms.collections.create",
  "cms.collections.update",
  "cms.collections.remove",
  "cms.collections.compileSchema",
  "cms.collections.setTemplate",
  "cms.collections.clearTemplate",
  "cms.entries.list",
  "cms.entries.query",
  "cms.entries.get",
  "cms.entries.create",
  "cms.entries.update",
  "cms.entries.remove",
  "cms.revisions.list",
  "cms.revisions.get",
  "cms.revisions.restore",
]);

const CmsPublishOperationSchema = z.enum(["cms.entries.publish"]);

const CmsUnpublishOperationSchema = z.enum([
  "cms.entries.unpublish",
  "cms.entries.archive",
]);

const cmsEditOperations = CmsEditOperationSchema.array().parse(
  CmsEditOperationSchema.options,
);
const cmsPublishOperations = CmsPublishOperationSchema.array().parse(
  CmsPublishOperationSchema.options,
);
const cmsUnpublishOperations = CmsUnpublishOperationSchema.array().parse(
  CmsUnpublishOperationSchema.options,
);
const allCmsOperations = OperationIdSchema.array().parse([
  ...cmsEditOperations,
  ...cmsPublishOperations,
  ...cmsUnpublishOperations,
]);

const contributor: SessionUser = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "contributor",
  email: "contributor@example.com",
  role: "contributor",
  totpEnabled: false,
};

const contentEditor: SessionUser = {
  id: "22222222-2222-4222-8222-222222222222",
  username: "editor",
  email: "editor@example.com",
  role: "content-editor",
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

describe("CMS operation permissions", () => {
  it("keeps the CMS permission test matrix on valid operation ids", () => {
    expect(allCmsOperations).toHaveLength(20);
  });

  it.each(cmsEditOperations)("allows contributor editCms operation %s", async (operationId) => {
    await expect(
      requireOperation(createContext(contributor), operationId),
    ).resolves.toMatchObject({ role: "contributor" });
  });

  it.each(cmsPublishOperations)(
    "denies contributor publish operation %s without publishContent",
    async (operationId) => {
      await expect(
        requireOperation(createContext(contributor), operationId),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    },
  );

  it.each(cmsUnpublishOperations)(
    "denies contributor unpublish operation %s without unpublishContent",
    async (operationId) => {
      await expect(
        requireOperation(createContext(contributor), operationId),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    },
  );

  it.each([...cmsPublishOperations, ...cmsUnpublishOperations])(
    "denies content-editor workflow operation %s by default",
    async (operationId) => {
      await expect(
        requireOperation(createContext(contentEditor), operationId),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    },
  );

  it.each(allCmsOperations)("allows manager CMS operation %s", async (operationId) => {
    await expect(
      requireOperation(createContext(manager), operationId),
    ).resolves.toMatchObject({ role: "manager" });
  });

  it("honors publishContent override for CMS publish only", async () => {
    const contributorWithPublish: SessionUser = {
      ...contributor,
      permissionProfile: {
        rolePreset: "contributor",
        capabilityOverrides: { allow: ["publishContent"] },
      },
    };

    await expect(
      requireOperation(createContext(contributorWithPublish), "cms.entries.publish"),
    ).resolves.toMatchObject({ role: "contributor" });
    await expect(
      requireOperation(
        createContext(contributorWithPublish),
        "cms.entries.unpublish",
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("honors unpublishContent override for CMS unpublish and archive", async () => {
    const contributorWithUnpublish: SessionUser = {
      ...contributor,
      permissionProfile: {
        rolePreset: "contributor",
        capabilityOverrides: { allow: ["unpublishContent"] },
      },
    };

    await expect(
      requireOperation(
        createContext(contributorWithUnpublish),
        "cms.entries.unpublish",
      ),
    ).resolves.toMatchObject({ role: "contributor" });
    await expect(
      requireOperation(createContext(contributorWithUnpublish), "cms.entries.archive"),
    ).resolves.toMatchObject({ role: "contributor" });
    await expect(
      requireOperation(
        createContext(contributorWithUnpublish),
        "cms.entries.publish",
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
