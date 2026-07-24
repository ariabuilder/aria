import { computed, ref, watch, type Ref } from "vue";
import { actions } from "astro:actions";
import { z } from "zod";
import { ListCollectionsResponseSchema } from "../../../../../lib/cms/actionSchemas";
import { AriaCollectionSchema, type AriaCollection } from "../../../../../lib/cms/schemas";
import { collectionsRequiringClearForRoleChange } from "../../../../../lib/pages/cmsTemplatePolicy";
import { StoredPageSystemRoleSchema } from "../../../../../lib/storage/adapter";
import {
  collectionToSummary,
  type CollectionSummary,
} from "@/features/CMS/composables/useCollectionsList";

export type CmsPageAssignmentSlot = "list" | "template";

export type CmsPageAssignmentReassignmentImpact = {
  collectionId: string;
  collectionLabel: string;
  field: "listPageId" | "templatePageId";
  previousPageId: string | null;
  nextPageId: string;
};

function slotField(slot: CmsPageAssignmentSlot): "listPageId" | "templatePageId" {
  return slot === "list" ? "listPageId" : "templatePageId";
}

export function usePageCmsTemplateAssignments(input: {
  pageId: Ref<string | undefined>;
  slot: Ref<CmsPageAssignmentSlot>;
  /** Local (possibly unsaved) page type selection, used to preview which
   *  collection bindings will be auto-cleared once the role change is saved. */
  pendingSystemRole?: Ref<z.infer<typeof StoredPageSystemRoleSchema> | undefined>;
}) {
  const collections = ref<CollectionSummary[]>([]);
  const collectionRecords = ref<Map<string, AriaCollection>>(new Map());
  const isLoading = ref(false);
  const loadError = ref<string | null>(null);
  const selectedCollectionId = ref("");
  const isAssigning = ref(false);
  const unassigningCollectionId = ref<string | null>(null);

  function applyCollectionsData(
    data: z.infer<typeof ListCollectionsResponseSchema>,
  ): void {
    const records = new Map<string, AriaCollection>();
    collections.value = data.collections.map((collection) => {
      const parsed = AriaCollectionSchema.parse(collection);
      records.set(parsed.id, parsed);
      return collectionToSummary(
        parsed,
        data.entryCounts[parsed.id] ?? 0,
      );
    });
    collectionRecords.value = records;
  }

  async function refresh(): Promise<void> {
    const pageId = input.pageId.value?.trim();
    if (!pageId) {
      collections.value = [];
      collectionRecords.value = new Map();
      selectedCollectionId.value = "";
      return;
    }

    isLoading.value = true;
    loadError.value = null;
    try {
      const result = await actions.cms.collections.list({});
      if (result.error || !result.data) {
        throw new Error(result.error?.message ?? "Failed to load collections");
      }
      applyCollectionsData(ListCollectionsResponseSchema.parse(result.data));
    } catch (error) {
      loadError.value =
        error instanceof Error ? error.message : "Failed to load collections";
      collections.value = [];
      collectionRecords.value = new Map();
    } finally {
      isLoading.value = false;
    }
  }

  watch(
    () => [input.pageId.value, input.slot.value] as const,
    () => {
      void refresh();
    },
    { immediate: true },
  );

  const assignedCollections = computed(() => {
    const pageId = input.pageId.value?.trim();
    if (!pageId) return [];
    const field = slotField(input.slot.value);
    return collections.value.filter((collection) => {
      const record = collectionRecords.value.get(collection.id);
      return record?.[field] === pageId;
    });
  });

  const unassignedCollections = computed(() => {
    const pageId = input.pageId.value?.trim();
    const field = slotField(input.slot.value);
    if (!pageId) return collections.value;
    return collections.value.filter((collection) => {
      const record = collectionRecords.value.get(collection.id);
      return record?.[field] !== pageId;
    });
  });

  const pendingAssignmentClears = computed(() => {
    const pageId = input.pageId.value?.trim();
    const nextSystemRole = input.pendingSystemRole?.value;
    if (!pageId || !nextSystemRole) return [];
    return collectionsRequiringClearForRoleChange({
      pageId,
      nextSystemRole,
      collections: Array.from(collectionRecords.value.values()),
    });
  });

  async function assignSelectedCollection(): Promise<AriaCollection | null> {
    const pageId = input.pageId.value?.trim();
    const collectionId = selectedCollectionId.value.trim();
    if (!pageId || !collectionId) {
      return null;
    }

    const collection = collectionRecords.value.get(collectionId);
    if (!collection) {
      throw new Error("Collection not found.");
    }

    const field = slotField(input.slot.value);
    isAssigning.value = true;
    try {
      const result = await actions.cms.collections.update({
        id: collection.id,
        expectedUpdatedAt: collection.updatedAt,
        patch: {
          [field]: pageId,
        },
      });
      if (result.error || !result.data) {
        throw new Error(result.error?.message ?? "Failed to assign collection");
      }
      const updated = AriaCollectionSchema.parse(result.data);
      await refresh();
      selectedCollectionId.value = "";
      return updated;
    } finally {
      isAssigning.value = false;
    }
  }

  function getSelectedCollectionReassignmentImpact():
    | CmsPageAssignmentReassignmentImpact
    | null {
    const pageId = input.pageId.value?.trim();
    const collectionId = selectedCollectionId.value.trim();
    if (!pageId || !collectionId) {
      return null;
    }

    const collection = collectionRecords.value.get(collectionId);
    if (!collection) {
      return null;
    }

    const field = slotField(input.slot.value);
    const previousPageId = collection[field]?.trim() || null;
    if (!previousPageId || previousPageId === pageId) {
      return null;
    }

    return {
      collectionId: collection.id,
      collectionLabel: collection.label,
      field,
      previousPageId,
      nextPageId: pageId,
    };
  }

  async function unassignCollection(
    collectionId: string,
  ): Promise<AriaCollection | null> {
    const pageId = input.pageId.value?.trim();
    const parsedCollectionId = collectionId.trim();
    if (!pageId || !parsedCollectionId) {
      return null;
    }

    const collection = collectionRecords.value.get(parsedCollectionId);
    if (!collection) {
      throw new Error("Collection not found.");
    }

    const field = slotField(input.slot.value);
    if (collection[field] !== pageId) {
      return null;
    }

    unassigningCollectionId.value = parsedCollectionId;
    try {
      const result = await actions.cms.collections.update({
        id: collection.id,
        expectedUpdatedAt: collection.updatedAt,
        patch: {
          [field]: null,
        },
      });
      if (result.error || !result.data) {
        throw new Error(
          result.error?.message ?? "Failed to remove collection assignment",
        );
      }
      const updated = AriaCollectionSchema.parse(result.data);
      collectionRecords.value.set(updated.id, updated);
      collections.value = collections.value.map((entry) =>
        entry.id === updated.id
          ? collectionToSummary(updated, entry.itemCount)
          : entry,
      );
      return updated;
    } finally {
      unassigningCollectionId.value = null;
    }
  }

  return {
    collections,
    assignedCollections,
    unassignedCollections,
    pendingAssignmentClears,
    selectedCollectionId,
    isLoading,
    isAssigning,
    unassigningCollectionId,
    loadError,
    refresh,
    getSelectedCollectionReassignmentImpact,
    assignSelectedCollection,
    unassignCollection,
  };
}

export type PageCmsTemplateAssignments = ReturnType<
  typeof usePageCmsTemplateAssignments
>;
