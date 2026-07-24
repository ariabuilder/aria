/**
 * Studio Pages — public API
 */

export { default as PagesView } from "./PagesView.vue";
export { default as PageDetailView } from "./PageDetailView.vue";

export { usePageDetailState } from "./composables/usePageDetailState";
export { usePageActions } from "./composables/usePageActions";
export { usePagesListState } from "./composables/usePagesListState";
export { useCreatePageDialog } from "./composables/useCreatePageDialog";
export { usePageSeo } from "./composables/usePageSeo";
export { usePageDetailTabs } from "./composables/usePageDetailTabs";
export { usePageAccessState } from "./composables/usePageAccessState";

export {
  validatePageForm,
  PageFormSchema,
  PageStatusSchema,
  PageAccessModeSchema,
} from "./composables/usePageForm";
export type { PageFormValues, PageStatus, PageAccessMode } from "./composables/usePageForm";

export {
  useSeoAnalysis,
  clearSeoCache,
  clearAllSeoCache,
} from "./composables/useSeoAnalysis";
