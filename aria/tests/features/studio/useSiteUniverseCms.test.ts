import { describe, expect, it } from "vitest";
import type { CollectionSummary } from "../../../admin/features/CMS/composables/useCollectionsList";
import {
  buildSiteUniverseCmsSystems,
  CMS_UNIVERSE_COLLECTION_LIMIT,
  CMS_UNIVERSE_ENTRY_LIMIT,
  CMS_UNIVERSE_ENTRY_LIMIT_PER_COLLECTION,
  type SiteUniverseCmsEntryInput,
} from "../../../admin/features/Studio/dashboard/composables/useSiteUniverseCms";

function collection(index: number, itemCount = 10): CollectionSummary {
  return {
    id: `collection-${index}`,
    name: `collection-${index}`,
    label: `Collection ${index}`,
    kind: "content",
    iconName: null,
    showInSidebar: true,
    itemCount,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: `2026-06-${String(30 - index).padStart(2, "0")}T00:00:00.000Z`,
  };
}

function entry(
  collectionIndex: number,
  entryIndex: number,
): SiteUniverseCmsEntryInput {
  return {
    id: `entry-${collectionIndex}-${entryIndex}`,
    collectionId: `collection-${collectionIndex}`,
    collectionName: `collection-${collectionIndex}`,
    title: `Entry ${collectionIndex}-${entryIndex}`,
    slug: `entry-${collectionIndex}-${entryIndex}`,
    locale: "en",
    status: entryIndex % 2 === 0 ? "published" : "draft",
    updatedAt: `2026-07-${String(31 - entryIndex).padStart(2, "0")}T00:00:00.000Z`,
  };
}

describe("buildSiteUniverseCmsSystems", () => {
  it("keeps empty collections visible and produces deterministic orbit values", () => {
    const collections = [collection(0, 0), collection(1)];
    const entries = [entry(1, 0), entry(1, 1)];

    const first = buildSiteUniverseCmsSystems(collections, entries);
    const second = buildSiteUniverseCmsSystems(collections, entries);

    expect(first).toEqual(second);
    expect(first).toHaveLength(2);
    expect(
      first.find((system) => system.id === "collection-0")?.entries,
    ).toEqual([]);
    expect(
      first.find((system) => system.id === "collection-1")?.entries,
    ).toHaveLength(2);
    expect(first.every((system) => system.durationMs >= 70_000)).toBe(true);
    expect(
      first
        .flatMap((system) => system.entries)
        .every(
          (item) => item.durationMs >= 18_000 && item.durationMs <= 32_000,
        ),
    ).toBe(true);
  });

  it("enforces collection, per-collection, and global entry caps", () => {
    const collections = Array.from({ length: 10 }, (_, index) =>
      collection(index),
    );
    const entries = collections.flatMap((_, collectionIndex) =>
      Array.from({ length: 8 }, (_, entryIndex) =>
        entry(collectionIndex, entryIndex),
      ),
    );

    const systems = buildSiteUniverseCmsSystems(collections, entries);
    const visibleEntries = systems.flatMap((system) => system.entries);

    expect(systems).toHaveLength(CMS_UNIVERSE_COLLECTION_LIMIT);
    expect(visibleEntries.length).toBeLessThanOrEqual(CMS_UNIVERSE_ENTRY_LIMIT);
    expect(
      systems.every(
        (system) =>
          system.entries.length <= CMS_UNIVERSE_ENTRY_LIMIT_PER_COLLECTION,
      ),
    ).toBe(true);
  });
});
