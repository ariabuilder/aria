import { actions } from "astro:actions";
import { computed, ref, watch, type Ref } from "vue";
import type { CollectionEntryContext } from "../../../../lib/rendering/resolvePublicPageRoute";
import type { RenderCmsDataOptions } from "../../../../lib/cms/resolveBoundNodes";
import type { PageDSL } from "../../../../lib/types/nodes";
import type { AriaCollection, AriaEntryRecord } from "../../../../lib/cms/schemas";

function sourceEntrySlug(record: AriaEntryRecord): string {
  return (
    record.locales.find((locale) => locale.isSource)?.slug ??
    record.locales[0]?.slug ??
    ""
  );
}

export function useCmsPreviewEntryContext(currentPage: Ref<PageDSL | null>) {
  const templateCollection = ref<AriaCollection | null>(null);
  const listCollection = ref<AriaCollection | null>(null);
  const previewEntryId = ref("");
  const previewEntrySlug = ref("");
  const isLoading = ref(false);

  async function refreshCollections(): Promise<void> {
    const page = currentPage.value;
    if (!page?.id) {
      templateCollection.value = null;
      listCollection.value = null;
      previewEntryId.value = "";
      previewEntrySlug.value = "";
      return;
    }

    isLoading.value = true;
    try {
      const result = await actions.cms.collections.list({});
      if (result.error || !result.data) {
        return;
      }

      const collections = result.data.collections;
      templateCollection.value =
        collections.find((collection) => collection.templatePageId === page.id) ??
        null;
      listCollection.value =
        collections.find((collection) => collection.listPageId === page.id) ??
        null;

      if (templateCollection.value && !previewEntryId.value) {
        await loadDefaultPreviewEntry(templateCollection.value.id);
      }
    } finally {
      isLoading.value = false;
    }
  }

  async function loadDefaultPreviewEntry(collectionId: string): Promise<void> {
    const result = await actions.cms.entries.list({
      collectionId,
      limit: 1,
      page: 1,
      status: "published",
    });
    const first = result.data?.items[0];
    const firstSlug = first ? sourceEntrySlug(first) : "";
    if (first && firstSlug) {
      previewEntryId.value = first.entry.id;
      previewEntrySlug.value = firstSlug;
      return;
    }

    const draftResult = await actions.cms.entries.list({
      collectionId,
      limit: 1,
      page: 1,
    });
    const draft = draftResult.data?.items[0];
    const draftSlug = draft ? sourceEntrySlug(draft) : "";
    if (draft && draftSlug) {
      previewEntryId.value = draft.entry.id;
      previewEntrySlug.value = draftSlug;
    }
  }

  watch(
    () => currentPage.value?.id,
    () => {
      previewEntryId.value = "";
      previewEntrySlug.value = "";
      void refreshCollections();
    },
    { immediate: true },
  );

  const isTemplatePage = computed(() => Boolean(templateCollection.value));
  const isListPage = computed(() => Boolean(listCollection.value));

  // Collection assignment (templatePageId / listPageId) is the source of truth.
  // systemRole can lag behind in the composer when page-type settings are unsaved.
  const isEntryTemplatePage = computed(() => Boolean(templateCollection.value));

  const isListTemplatePage = computed(
    () => Boolean(listCollection.value) && !templateCollection.value,
  );

  const showCmsEntryHeader = computed(() => isEntryTemplatePage.value);

  const showCmsListHeader = computed(() => isListTemplatePage.value);

  const pageAssignedCollection = computed(() => {
    if (templateCollection.value) {
      return templateCollection.value;
    }
    if (listCollection.value) {
      return listCollection.value;
    }
    return null;
  });

  const entryContext = computed<CollectionEntryContext | null>(() => {
    const collection = templateCollection.value;
    if (!collection || !previewEntryId.value || !previewEntrySlug.value) {
      return null;
    }
    return {
      collectionId: collection.id,
      entryId: previewEntryId.value,
      slug: previewEntrySlug.value,
    };
  });

  const cmsRenderOptions = computed<RenderCmsDataOptions>(() => {
    const options: RenderCmsDataOptions = { preview: true };
    if (entryContext.value) {
      options.entryContext = entryContext.value;
    }
    return options;
  });

  function setPreviewEntry(entry: { id: string; slug: string }): void {
    previewEntryId.value = entry.id;
    previewEntrySlug.value = entry.slug;
  }

  return {
    templateCollection,
    listCollection,
    isTemplatePage,
    isListPage,
    isEntryTemplatePage,
    isListTemplatePage,
    showCmsEntryHeader,
    showCmsListHeader,
    pageAssignedCollection,
    previewEntryId,
    previewEntrySlug,
    entryContext,
    cmsRenderOptions,
    isLoading,
    setPreviewEntry,
    refreshCollections,
  };
}

export type CmsPreviewEntryContext = ReturnType<typeof useCmsPreviewEntryContext>;
