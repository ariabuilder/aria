/**
 * Studio route guards: composer deep links and contributor page-detail redirect.
 */

import { onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { toast } from "vue-sonner";
import { useUser } from "../features/Auth/composables/useUser";
import { useStudioCapabilities } from "./useStudioCapabilities";
import {
  CONTRIBUTOR_COMPOSER_DENIED_MESSAGE,
  CONTRIBUTOR_LANDING_PATH,
  StudioItemTypeSchema,
  composerOperationForItemType,
} from "./useComposerAccess";
import { getForbiddenMessageForOperation } from "./useCapabilities";
import {
  getComposerItemFeatureDisabledMessage,
  isComposerItemFeatureEnabled,
} from "../../lib/features";

function parseComposerRoute(
  path: string,
  query: Record<string, unknown>,
): { itemType: "page" | "layout" | "component"; itemSlug: string } | null {
  if (!("composer" in query)) return null;

  const parts = path.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  const typeMap: Record<string, "page" | "layout" | "component"> = {
    pages: "page",
    layouts: "layout",
    components: "component",
  };
  const itemType = typeMap[parts[0]];
  const itemSlug = parts[1];
  if (!itemType || !itemSlug || itemSlug === "new") return null;

  return {
    itemType: StudioItemTypeSchema.parse(itemType),
    itemSlug,
  };
}

function stripComposerFromPath(path: string): string {
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return "/dashboard";
  return `/${segments[0]}`;
}

export function useStudioRouteGuards(): void {
  const route = useRoute();
  const vueRouter = useRouter();
  const { fetchUser } = useUser();
  const caps = useStudioCapabilities();

  onMounted(() => {
    void fetchUser();
  });

  watch(
    () => [route.path, route.query, caps.isReady.value] as const,
    () => {
      if (!caps.isReady.value) return;

      const composerTarget = parseComposerRoute(
        route.path,
        route.query as Record<string, unknown>,
      );
      if (composerTarget) {
        if (!isComposerItemFeatureEnabled(composerTarget.itemType)) {
          const message = getComposerItemFeatureDisabledMessage(
            composerTarget.itemType,
          );
          if (message) {
            toast.error(message);
          }
          const fallback =
            composerTarget.itemType === "layout"
              ? "/dashboard"
              : stripComposerFromPath(route.path);
          if (route.fullPath !== fallback) {
            void vueRouter.replace(fallback);
          }
          return;
        }

        if (!caps.canEditItemInComposer(composerTarget.itemType)) {
          const operationId = composerOperationForItemType(
            composerTarget.itemType,
          );
          toast.error(
            caps.isContributor.value
              ? CONTRIBUTOR_COMPOSER_DENIED_MESSAGE
              : getForbiddenMessageForOperation(operationId),
          );
          const fallback = caps.isContributor.value
            ? CONTRIBUTOR_LANDING_PATH
            : stripComposerFromPath(route.path);
          if (route.fullPath !== fallback) {
            void vueRouter.replace(fallback);
          }
          return;
        }
      }

      if (caps.isContributor.value && route.path.startsWith("/pages/")) {
        if (route.path !== CONTRIBUTOR_LANDING_PATH) {
          toast.error(CONTRIBUTOR_COMPOSER_DENIED_MESSAGE);
          void vueRouter.replace(CONTRIBUTOR_LANDING_PATH);
        }
      }
    },
    { immediate: true },
  );
}
