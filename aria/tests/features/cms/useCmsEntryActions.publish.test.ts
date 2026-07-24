import { beforeEach, describe, expect, it, vi } from "vitest";
import { actions } from "astro:actions";
import type { AriaEntryRecord } from "../../../lib/cms/schemas";

type CapturedOperation = {
  redo: () => Promise<void>;
  undo: () => Promise<void>;
};

const { executeMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
}));

vi.mock("@/features/History", () => ({
  useHistory: () => ({
    execute: executeMock,
  }),
}));

vi.mock("vue-sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

function entryRecord(
  version: string,
  status: AriaEntryRecord["entry"]["status"] = "draft",
): AriaEntryRecord {
  const timestamp = "2026-06-29T05:00:00.000Z";
  return {
    entry: {
      id: "canonical-entry",
      collectionId: "canonical-collection",
      status,
      version,
      authorId: "author-1",
      createdAt: timestamp,
      updatedAt: timestamp,
      publishedAt: status === "published" ? timestamp : null,
      scheduledFor: null,
    },
    locales: [
      {
        entryId: "canonical-entry",
        collectionId: "canonical-collection",
        locale: "en",
        slug: "canonical-entry",
        title: "Canonical Entry",
        frontmatter: {},
        body: null,
        isSource: true,
      },
    ],
    authorship: {
      author: { id: "author-1", username: "Author" },
      createdBy: { id: "author-1", username: "Author" },
      updatedBy: { id: "author-1", username: "Author" },
      publishedBy:
        status === "published"
          ? { id: "publisher-1", username: "Publisher" }
          : null,
    },
  };
}

describe("useCmsEntryActions publish", () => {
  const entriesActions = {
    get: vi.fn(),
    publish: vi.fn(),
    unpublish: vi.fn(),
    archive: vi.fn(),
    restoreSnapshot: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (actions as unknown as { cms: { entries: typeof entriesActions } }).cms = {
      entries: entriesActions,
    };
    executeMock.mockImplementation(async (operation: CapturedOperation) => {
      await operation.redo();
      return { success: true, error: undefined };
    });
  });

  it("publishes with the canonical loaded record without refetching a row snapshot", async () => {
    const { useCmsEntryActions } = await import(
      "../../../admin/features/CMS/composables/useCmsEntryActions"
    );
    const loadedRecord = entryRecord("v1");
    const publishedRecord = entryRecord("v2", "published");
    const applyRecord = vi.fn();

    entriesActions.publish.mockResolvedValueOnce({
      data: publishedRecord,
      error: null,
    });

    const entryActions = useCmsEntryActions();
    const ok = await entryActions.publishEntry(loadedRecord, applyRecord);

    expect(ok).toBe(true);
    expect(entriesActions.get).not.toHaveBeenCalled();
    expect(entriesActions.publish).toHaveBeenCalledWith({
      collectionId: "canonical-collection",
      id: "canonical-entry",
      version: "v1",
    });
    expect(applyRecord).toHaveBeenCalledWith(publishedRecord);
  });

  it("uses the returned record version for repeated publish attempts", async () => {
    const { useCmsEntryActions } = await import(
      "../../../admin/features/CMS/composables/useCmsEntryActions"
    );
    let currentRecord = entryRecord("v1");

    entriesActions.publish
      .mockResolvedValueOnce({ data: entryRecord("v2", "published"), error: null })
      .mockResolvedValueOnce({ data: entryRecord("v3", "published"), error: null });

    const entryActions = useCmsEntryActions();
    await entryActions.publishEntry(currentRecord, (record) => {
      currentRecord = record;
    });
    await entryActions.publishEntry(currentRecord, (record) => {
      currentRecord = record;
    });

    expect(entriesActions.publish).toHaveBeenNthCalledWith(1, {
      collectionId: "canonical-collection",
      id: "canonical-entry",
      version: "v1",
    });
    expect(entriesActions.publish).toHaveBeenNthCalledWith(2, {
      collectionId: "canonical-collection",
      id: "canonical-entry",
      version: "v2",
    });
    expect(currentRecord.entry.version).toBe("v3");
  });
});
