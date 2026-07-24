/**
 * CMS Feature Public API
 */

export { useCollectionsViewState } from "./composables/useCollectionsViewState";
export { useCollectionsList } from "./composables/useCollectionsList";
export { useCollectionDetail } from "./composables/useCollectionDetail";
export { useCollectionDetailState } from "./composables/useCollectionDetailState";
export { useCmsEntriesList } from "./composables/useCmsEntriesList";
export { useCmsEntryTable } from "./composables/useCmsEntryTable";
export { useCmsEntryActions } from "./composables/useCmsEntryActions";
export { useCollectionIcons } from "./composables/useCollectionIcons";
export { useCreateCollectionDialog } from "./composables/useCreateCollectionDialog";
export {
  useCreateCollectionForm,
  type CreatedCollectionResult,
} from "./composables/useCreateCollectionForm";
export { useCreateEntryDialog } from "./composables/useCreateEntryDialog";
export { useCreateEntryForm } from "./composables/useCreateEntryForm";
export { useEditEntryForm } from "./composables/useEditEntryForm";
export { useEntryEditorDrawer } from "./composables/useEntryEditorDrawer";
export { useCmsCapabilities } from "./composables/useCmsCapabilities";
export { COLLECTION_KIND_OPTIONS } from "./lib/collectionKindOptions";
export type { CollectionSummary } from "./composables/useCollectionsList";
export type { CmsEntryRow } from "./lib/entryRow";
export { default as CollectionsView } from "./views/CollectionsView.vue";
export { default as CollectionDetailView } from "./views/CollectionDetailView.vue";
export { default as EntryDetailView } from "./views/EntryDetailView.vue";
export { default as CreateCollectionDialog } from "./dialogs/CreateCollectionDialog.vue";
export { default as CreateEntryDialog } from "./dialogs/CreateEntryDialog.vue";
export { default as EntryEditorDrawer } from "./dialogs/EntryEditorDrawer.vue";
