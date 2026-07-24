import { computed, onMounted, type ComputedRef } from "vue";
import { useBuilderData } from "@/composables/useBuilderData";
import { useSiteSettings } from "@/composables/useSiteSettings";
import { formatRelativeTime } from "@/features/Core/utils/formatting";
import { useStudioI18n } from "@/i18n";
import {
  DashboardLiveStatusSchema,
  parseVisitSiteUrl,
  resolveDashboardSiteTitle,
  type DashboardLiveStatus,
  type VisitSiteUrl,
  VISIT_SITE_FALLBACK_URL,
} from "../schemas/dashboard";

export interface UseDashboardHeroReturn {
  siteTitle: ComputedRef<string>;
  liveStatus: ComputedRef<DashboardLiveStatus>;
  isLive: ComputedRef<boolean>;
  lastPublishedLabel: ComputedRef<string>;
  visitSiteUrl: ComputedRef<VisitSiteUrl | typeof VISIT_SITE_FALLBACK_URL>;
  visitSite: () => void;
}

/**
 * Reads the SSR-hydrated site name injected by admin.astro.
 * Falls back to undefined when not available (SSR miss, first paint before
 * the inline script, or the value was empty).
 */
function readSsrSiteName(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const name = (window as unknown as Record<string, unknown>)
      .__ARIA_SSR_SITE_NAME;
    return typeof name === "string" && name.length > 0 ? name : undefined;
  } catch {
    return undefined;
  }
}

const _ssrSiteName = readSsrSiteName();

export function useDashboardHero(): UseDashboardHeroReturn {
  const { t } = useStudioI18n();
  const { pages } = useBuilderData();
  const { generalSettings, isReady, loadSettings } = useSiteSettings();

  onMounted(() => {
    void loadSettings();
  });

  const siteTitle = computed(() =>
    resolveDashboardSiteTitle({
      siteName: generalSettings.value.siteName,
      isReady: isReady.value,
      ssrSiteName: _ssrSiteName,
    }),
  );

  const publishedPages = computed(() =>
    pages.value.filter((page) => page.status === "published"),
  );

  const isLive = computed(() => publishedPages.value.length > 0);

  const liveStatus = computed(
    (): DashboardLiveStatus =>
      DashboardLiveStatusSchema.parse(isLive.value ? "live" : "offline"),
  );

  const latestPublishedPage = computed(
    () =>
      [...publishedPages.value].sort(
        (a, b) =>
          new Date(b.updatedAt ?? 0).getTime() -
          new Date(a.updatedAt ?? 0).getTime(),
      )[0],
  );

  const lastPublishedLabel = computed(() => {
    if (!latestPublishedPage.value?.updatedAt) {
      return t("dashboard.hero.neverPublished");
    }
    return t("dashboard.hero.published", {
      time: formatRelativeTime(latestPublishedPage.value.updatedAt),
    });
  });

  const visitSiteUrl = computed(() =>
    parseVisitSiteUrl(generalSettings.value.siteUrl),
  );

  function visitSite(): void {
    if (typeof window === "undefined") {
      return;
    }
    window.open(visitSiteUrl.value, "_blank", "noopener,noreferrer");
  }

  return {
    siteTitle,
    liveStatus,
    isLive,
    lastPublishedLabel,
    visitSiteUrl,
    visitSite,
  };
}
