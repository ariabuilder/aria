import { computed, ref, watch, type ComputedRef, type Ref } from "vue";
import { useStudioI18n } from "@/i18n";

export const PAGE_DETAIL_TABS = [
  { id: "overview", label: "Overview" },
  { id: "type", label: "Type" },
  { id: "seo", label: "SEO" },
  { id: "access", label: "Access" },
  { id: "content", label: "Content" },
  { id: "media", label: "Media" },
  { id: "localization", label: "Localization" },
] as const;

export type PageDetailTab = (typeof PAGE_DETAIL_TABS)[number]["id"];
export type PageDetailTabDefinition = {
  id: PageDetailTab;
  label: string;
};

export interface UsePageDetailTabsOptions {
  canEditPageSeo: Ref<boolean>;
  canManagePagePolicy: Ref<boolean>;
  onTabActivated?: (tab: PageDetailTab) => void | Promise<void>;
}

export interface UsePageDetailTabsReturn {
  activeTab: Ref<PageDetailTab>;
  visibleTabs: ComputedRef<PageDetailTabDefinition[]>;
}

export function usePageDetailTabs(
  options: UsePageDetailTabsOptions,
): UsePageDetailTabsReturn {
  const { t } = useStudioI18n();
  const activeTab = ref<PageDetailTab>("overview");

  const visibleTabs = computed<PageDetailTabDefinition[]>(() =>
    PAGE_DETAIL_TABS.map((tab) => ({
      ...tab,
      label: t(`pages.detail.tabs.${tab.id}` as const),
    })).filter((tab) => {
      if (tab.id === "seo") {
        return options.canEditPageSeo.value;
      }
      if (tab.id === "type" || tab.id === "access") {
        return options.canManagePagePolicy.value;
      }
      return true;
    }),
  );

  watch(visibleTabs, (tabs) => {
    if (!tabs.some((tab) => tab.id === activeTab.value)) {
      activeTab.value = "overview";
    }
  });

  if (options.onTabActivated) {
    watch(activeTab, (tab) => {
      void options.onTabActivated?.(tab);
    });
  }

  return {
    activeTab,
    visibleTabs,
  };
}
