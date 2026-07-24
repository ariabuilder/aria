import { describe, expect, it, vi } from "vitest";
import type { ActionAPIContext } from "astro:actions";
import { AriaCollectionSchema } from "../../lib/cms/schemas";
import {
  MarkdownImportApplyReportSchema,
  MarkdownImportPreviewSchema,
} from "../../lib/cms/markdown-import/schemas";
import { callDefinedAction } from "../../admin/features/Agent/lib/tools/callDefinedAction";

const mocks = vi.hoisted(() => ({
  adapter: {},
  getStorageAdapterAsync: vi.fn(),
  requireOperation: vi.fn(),
  resolveAuthorizedMutation: vi.fn(),
  extractMarkdownImportSources: vi.fn(),
  previewMarkdownImport: vi.fn(),
  applyMarkdownImport: vi.fn(),
  requireCmsCollectionPolicy: vi.fn(),
  recordCmsAudit: vi.fn(),
  resolveCmsPolicyLocale: vi.fn(),
}));

vi.mock("../../lib/storage/getStorageAdapter", () => ({
  getStorageAdapterAsync: mocks.getStorageAdapterAsync,
}));

vi.mock("../../actions/_shared", () => ({
  requireOperation: mocks.requireOperation,
  resolveAuthorizedMutation: mocks.resolveAuthorizedMutation,
}));

vi.mock("../../actions/cms/accessPolicy", () => ({
  requireCmsCollectionPolicy: mocks.requireCmsCollectionPolicy,
  recordCmsAudit: mocks.recordCmsAudit,
  resolveCmsPolicyLocale: mocks.resolveCmsPolicyLocale,
}));

vi.mock("../../lib/cms/markdown-import", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/cms/markdown-import")>()),
  extractMarkdownImportSources: mocks.extractMarkdownImportSources,
  previewMarkdownImport: mocks.previewMarkdownImport,
  applyMarkdownImport: mocks.applyMarkdownImport,
}));

import { markdownImport } from "../../actions/cms/markdownImport";

const collection = AriaCollectionSchema.parse({
  id: "collection-1",
  name: "articles",
  label: "Articles",
  kind: "content",
  schema: {
    id: "collection-1",
    label: "Articles",
    kind: "content",
    fields: [],
    navigation: { showInSidebar: true },
    version: 1,
  },
  scope: "global",
  urlPattern: null,
  templatePageId: null,
  listPageId: null,
  supports: ["body"],
  createdAt: "2026-07-12T00:00:00.000Z",
  updatedAt: "2026-07-12T00:00:00.000Z",
});

const preview = MarkdownImportPreviewSchema.parse({
  collection,
  mode: "create",
  canApply: true,
  items: [],
  fieldSuggestions: [],
  summary: { creates: 1, updates: 0, skips: 0, errors: 0, warnings: 0 },
});

function context(): ActionAPIContext {
  return {
    locals: {},
    request: new Request("https://aria.internal/actions"),
  } as ActionAPIContext;
}

function actionInput(mode: "create" | "update" = "create") {
  return {
    collectionId: collection.id,
    mode,
    file: new File(["---\ntitle: Test\n---\nBody"], "test.md", {
      type: "text/markdown",
    }),
  };
}

describe("cms.markdownImport Astro Actions", () => {
  it("previews a form upload through the capability-gated service", async () => {
    mocks.getStorageAdapterAsync.mockResolvedValue(mocks.adapter);
    mocks.requireOperation.mockResolvedValue({
      id: "editor",
      username: "editor",
      role: "content-editor",
    });
    mocks.requireCmsCollectionPolicy.mockResolvedValue({
      allowed: true,
      editableFields: null,
    });
    mocks.resolveCmsPolicyLocale.mockResolvedValue("en");
    mocks.extractMarkdownImportSources.mockResolvedValue([
      { path: "test.md", content: "---\ntitle: Test\n---\nBody" },
    ]);
    mocks.previewMarkdownImport.mockResolvedValue(preview);

    await expect(
      callDefinedAction(markdownImport.preview, context(), actionInput()),
    ).resolves.toEqual(preview);
    expect(mocks.requireOperation).toHaveBeenCalledWith(
      expect.anything(),
      "cms.markdownImport.preview",
    );
    expect(mocks.previewMarkdownImport).toHaveBeenCalledWith(mocks.adapter, {
      collectionId: collection.id,
      mode: "create",
      sources: [{ path: "test.md", content: "---\ntitle: Test\n---\nBody" }],
    });
  });

  it("applies only through the authorized mutation boundary", async () => {
    const report = MarkdownImportApplyReportSchema.parse({
      ...preview,
      applied: true,
    });
    mocks.getStorageAdapterAsync.mockResolvedValue(mocks.adapter);
    mocks.resolveAuthorizedMutation.mockResolvedValue({
      user: { id: "editor", username: "editor", role: "content-editor" },
      authorship: { actor: { id: "editor" } },
    });
    mocks.requireCmsCollectionPolicy.mockResolvedValue({
      allowed: true,
      editableFields: null,
    });
    mocks.resolveCmsPolicyLocale.mockResolvedValue("en");
    mocks.extractMarkdownImportSources.mockResolvedValue([
      { path: "test.md", content: "---\ntitle: Test\n---\nBody" },
    ]);
    mocks.previewMarkdownImport.mockResolvedValue(preview);
    mocks.applyMarkdownImport.mockResolvedValue(report);

    await expect(
      callDefinedAction(markdownImport.apply, context(), actionInput("update")),
    ).resolves.toEqual(report);
    expect(mocks.resolveAuthorizedMutation).toHaveBeenCalledWith(
      expect.anything(),
      "cms.markdownImport.apply",
      "cms-collection-update",
    );
    expect(mocks.applyMarkdownImport).toHaveBeenCalledWith(
      mocks.adapter,
      {
        collectionId: collection.id,
        mode: "update",
        addFields: [],
        sources: [{ path: "test.md", content: "---\ntitle: Test\n---\nBody" }],
      },
      { id: "editor" },
    );
  });
});
