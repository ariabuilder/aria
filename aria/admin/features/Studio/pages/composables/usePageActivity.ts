import { ref, type Ref } from "vue";
import { actions } from "astro:actions";
import { useErrorBoundary } from "@/features/Studio/core/composables/useErrorBoundary";
import { PAGE_DETAIL_ERROR_CODES } from "@/lib/errors/pageDetailErrors";
import { handleActionResultForbidden } from "@/lib/actionErrors";
import {
  GetPageActivityOutputSchema,
  formatActivityActionLabel,
  type ActivityAction,
  type GetPageActivityOutput,
} from "../../../../../lib/schemas/activity";
import { isUserActivityMetadata } from "../../../../../lib/schemas/activityActors";

export interface PageActivityRecord {
  id: string;
  version: string;
  userId: string;
  userName: string;
  userAvatarUrl?: string;
  action: string;
  target: string;
  createdAt: string;
}

export interface UsePageActivityReturn {
  activities: Ref<PageActivityRecord[]>;
  total: Ref<number>;
  isLoading: Ref<boolean>;
  loadActivity: (slug: string, limit?: number) => Promise<void>;
  applyActivity: (output: GetPageActivityOutput) => void;
}

export function usePageActivity(): UsePageActivityReturn {
  const activities = ref<PageActivityRecord[]>([]);
  const total = ref(0);
  const isLoading = ref(false);
  const { handleError } = useErrorBoundary();
  let loadGeneration = 0;

  function applyActivity(output: GetPageActivityOutput): void {
    const userItems = output.items.filter((item) =>
      isUserActivityMetadata(item.activity),
    );
    total.value = output.total;
    activities.value = userItems.map((item) => {
      const activity = item.activity!;
      return {
        id: `${item.version}-${activity.userId}`,
        version: item.version,
        userId: activity.userId,
        userName: activity.userName,
        action: formatActivityActionLabel(activity.action as ActivityAction),
        target: activity.target,
        userAvatarUrl: activity.userAvatarUrl ?? undefined,
        createdAt: item.createdAt,
      };
    });
  }

  async function loadActivity(slug: string, limit = 5): Promise<void> {
    const generation = loadGeneration + 1;
    loadGeneration = generation;
    isLoading.value = true;
    activities.value = [];
    total.value = 0;
    try {
      const { data, error } = await actions.pages.getPageActivity({
        slug,
        limit,
        offset: 0,
      });

      if (generation !== loadGeneration) {
        return;
      }

      if (error) {
        if (handleActionResultForbidden({ error }, "pages.getPageActivity")) {
          activities.value = [];
          total.value = 0;
          return;
        }
        handleError(
          PAGE_DETAIL_ERROR_CODES.ACTIVITY_FETCH_FAILED,
          error.message ?? "Failed to load page activity",
          { severity: "warning" },
        );
        activities.value = [];
        total.value = 0;
        return;
      }

      const output = GetPageActivityOutputSchema.parse(data);
      if (generation !== loadGeneration) {
        return;
      }

      applyActivity(output);
    } catch (err) {
      if (generation !== loadGeneration) {
        return;
      }

      handleError(
        PAGE_DETAIL_ERROR_CODES.ACTIVITY_FETCH_FAILED,
        err instanceof Error ? err.message : "Failed to load page activity",
        { severity: "warning" },
      );
      activities.value = [];
      total.value = 0;
    } finally {
      if (generation === loadGeneration) {
        isLoading.value = false;
      }
    }
  }

  return {
    activities,
    total,
    isLoading,
    loadActivity,
    applyActivity,
  };
}
