import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AriaEntryRecord } from "../../../lib/cms/schemas";

const mocks = vi.hoisted(() => ({
  getEntry: vi.fn(),
  loadSettings: vi.fn(),
  contentLocalization: {
    value: {
      defaultLocale: "en",
      locales: [
        { code: "en", label: "English", enabled: true, fallbacks: [] },
        { code: "fr", label: "French", enabled: true, fallbacks: ["en"] },
      ],
    },
  },
}));

vi.mock("astro:actions", () => ({
  actions: {
    cms: {
      entries: {
        get: mocks.getEntry,
        checkSlugAvailability: vi.fn(),
      },
    },
  },
}));

vi.mock("vue-sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/composables/useSiteSettings", () => ({
  useSiteSettings: () => ({
    contentLocalization: mocks.contentLocalization,
    loadSettings: mocks.loadSettings.mockResolvedValue(undefined),
  }),
}));

vi.mock("@/i18n", () => ({
  useStudioI18n: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../../../admin/features/CMS/composables/useCmsEntryHistory", () => ({
  useCmsEntryHistory: () => ({
    recordUpdateEntry: vi.fn(),
  }),
}));

import { useEditEntryForm } from "../../../admin/features/CMS/composables/useEditEntryForm";

function englishRecord(): AriaEntryRecord {
  return {
    entry: {
      id: "entry-1",
      collectionId: "posts",
      status: "draft",
      version: "v1",
      authorId: "author-1",
      createdAt: "2026-07-12T00:00:00.000Z",
      updatedAt: "2026-07-12T00:00:00.000Z",
      publishedAt: null,
      scheduledFor: null,
    },
    locales: [
      {
        entryId: "entry-1",
        collectionId: "posts",
        locale: "en",
        slug: "hello-world",
        title: "Hello world",
        frontmatter: { excerpt: "Welcome" },
        body: [],
        isSource: true,
      },
    ],
  };
}

describe("CMS two-locale editor flow", () => {
  beforeEach(() => {
    mocks.contentLocalization.value = {
      defaultLocale: "en",
      locales: [
        { code: "en", label: "English", enabled: true, fallbacks: [] },
        { code: "fr", label: "French", enabled: true, fallbacks: ["en"] },
      ],
    };
    mocks.getEntry.mockResolvedValue({ data: englishRecord(), error: undefined });
  });

  it("creates an unsaved French copy from English without changing Studio language", async () => {
    const form = useEditEntryForm();
    await expect(form.loadEntry("posts", "entry-1", [])).resolves.toBe(true);

    expect(form.availableLocales.value).toEqual([
      { code: "en", label: "English", status: "available" },
      { code: "fr", label: "French", status: "missing" },
    ]);

    expect(form.switchActiveLocale("fr", [])).toBe(true);
    expect(form.activeLocaleCode.value).toBe("fr");
    expect(form.isLocalizedVariant.value).toBe(true);
    expect(form.title.value).toBe("Hello world");
    expect(form.slug.value).toBe("hello-world");
    expect(form.hasUnsavedChanges.value).toBe(true);
    expect(form.availableLocales.value[1]).toEqual({
      code: "fr",
      label: "French",
      status: "unsaved",
    });

    expect(form.switchActiveLocale("en", [])).toBe(true);
    expect(form.activeLocaleCode.value).toBe("en");
    expect(form.isLocalizedVariant.value).toBe(false);
  });

  it("requires saving or discarding an edited locale draft before switching", async () => {
    const form = useEditEntryForm();
    await expect(form.loadEntry("posts", "entry-1", [])).resolves.toBe(true);
    expect(form.switchActiveLocale("fr", [])).toBe(true);

    form.title.value = "Bonjour le monde";

    expect(form.switchActiveLocale("en", [])).toBe(false);
    expect(form.activeLocaleCode.value).toBe("fr");
  });
});
