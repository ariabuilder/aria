import { toast } from "vue-sonner";
import type { UseAppRouterReturn } from "../../Core";
import { StartEditingPayloadSchema } from "../../Core";
import { QuickSwitchPayloadSchema } from "../../Composer/schemas/quickSwitch";
import { useStudioCapabilities } from "@/composables/useStudioCapabilities";
import { CONTRIBUTOR_COMPOSER_DENIED_MESSAGE } from "@/composables/useComposerAccess";
import {
  getComposerItemFeatureDisabledMessage,
  isComposerItemFeatureEnabled,
} from "../../../../lib/features";

export interface UseStageSidebarLoadActionsDeps {
  appRouter: Pick<UseAppRouterReturn, "startEditing">;
  confirmComposerItemSwitch?: () => Promise<boolean>;
}

export interface UseStageSidebarLoadActionsReturn {
  handleSidebarSelectPage: (slug: string) => Promise<void>;
  handleSidebarCreatePage: (slug: string) => Promise<void>;
  handleSidebarSelectLayout: (slug: string) => Promise<void>;
  handleSidebarCreateLayout: (slug: string) => Promise<void>;
  handleSidebarSelectComponent: (slug: string) => Promise<void>;
  handleSidebarCreateComponent: (slug: string) => Promise<void>;
}

export function useStageSidebarLoadActions(
  deps: UseStageSidebarLoadActionsDeps,
): UseStageSidebarLoadActionsReturn {
  const { appRouter, confirmComposerItemSwitch } = deps;
  const caps = useStudioCapabilities();

  const navigateToItem = async (
    itemType: "page" | "layout" | "component",
    itemSlug: string,
  ): Promise<void> => {
    const parsedPayload = QuickSwitchPayloadSchema.safeParse({
      itemType,
      itemId: itemSlug,
    });

    if (!parsedPayload.success) {
      return;
    }

    const payload = StartEditingPayloadSchema.parse({
      itemType: parsedPayload.data.itemType,
      itemSlug: parsedPayload.data.itemId,
    });

    if (!isComposerItemFeatureEnabled(payload.itemType)) {
      const message = getComposerItemFeatureDisabledMessage(payload.itemType);
      if (message) {
        toast.error(message);
      }
      return;
    }

    if (
      caps.isReady.value &&
      !caps.canEditItemInComposer(payload.itemType)
    ) {
      toast.error(
        caps.isContributor.value
          ? CONTRIBUTOR_COMPOSER_DENIED_MESSAGE
          : caps.getForbiddenMessage(
              caps.composerOperationForItem(payload.itemType),
            ),
      );
      return;
    }

    // appRouter.startEditing updates Composer state immediately, ahead of the
    // URL watcher. Confirm first so a cancelled switch leaves both the route
    // and the visible canvas on the current item.
    if (confirmComposerItemSwitch) {
      const mayLeave = await confirmComposerItemSwitch();
      if (!mayLeave) return;
    }

    appRouter.startEditing(payload);
  };

  return {
    handleSidebarSelectPage: (slug) => navigateToItem("page", slug),
    handleSidebarCreatePage: (slug) => navigateToItem("page", slug),
    handleSidebarSelectLayout: (slug) => navigateToItem("layout", slug),
    handleSidebarCreateLayout: (slug) => navigateToItem("layout", slug),
    handleSidebarSelectComponent: (slug) => navigateToItem("component", slug),
    handleSidebarCreateComponent: (slug) => navigateToItem("component", slug),
  };
}
