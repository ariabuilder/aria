import { computed, type ComputedRef } from "vue";
import { useBuilderData } from "@/composables/useBuilderData";
import {
  ContinueWorkingItemSchema,
  type ContinueWorkingItem,
} from "../schemas/dashboard";

type ContinueWorkingCandidate = {
  updatedAt?: string | null;
  systemRole?: "standard" | "not-found" | "cms-collection" | "cms-entry";
};

export function selectContinueWorkingPage<T extends ContinueWorkingCandidate>(
  pages: readonly T[],
): T | null {
  const byMostRecentlyUpdated = (left: T, right: T) =>
    new Date(right.updatedAt!).getTime() -
    new Date(left.updatedAt!).getTime();

  const recentStandardPage = [...pages]
    .filter((page) => page.updatedAt)
    .filter((page) => (page.systemRole ?? "standard") === "standard")
    .sort(byMostRecentlyUpdated)[0];

  return (
    recentStandardPage ??
    [...pages]
      .filter((page) => page.updatedAt && page.systemRole !== "not-found")
      .sort(byMostRecentlyUpdated)[0] ??
    null
  );
}

export interface UseDashboardOverviewReturn {
  readonly continueWorkingItem: ComputedRef<ContinueWorkingItem | null>;
}

export function useDashboardOverview(): UseDashboardOverviewReturn {
  const { pages } = useBuilderData();

  const continueWorkingItem = computed((): ContinueWorkingItem | null => {
    const recent = selectContinueWorkingPage(pages.value);
    if (!recent) return null;

    return ContinueWorkingItemSchema.parse({
      pageId: recent.id,
      pageTitle: recent.title,
      pageSlug: recent.slug,
      pageStatus: recent.status,
      thumbnailUrl: recent.thumbnailUrl,
      snapshotUrl: recent.snapshotUrl,
      lastEditedAt: recent.updatedAt,
    });
  });

  return { continueWorkingItem };
}
