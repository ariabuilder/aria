import { startStartupTraceCycle, traceStartup } from "@/lib/startupTrace";

import type { UseAppRouterReturn } from "./useAppRouter";

interface WindowWithAriaServerStart extends Window {
  __ARIA_SERVER_START?: number;
}

export interface UseAppRouterBootstrapReturn {
  routerRestored: boolean;
}

export function useAppRouterBootstrap(
  appRouter: UseAppRouterReturn,
): UseAppRouterBootstrapReturn {
  startStartupTraceCycle("app:setup", {
    serverStart:
      typeof window !== "undefined"
        ? ((window as WindowWithAriaServerStart).__ARIA_SERVER_START ?? null)
        : null,
  });

  traceStartup("app-router:initialize:start");
  const routerRestored = appRouter.initialize();
  traceStartup("app-router:initialize:end", {
    restoredFromStorage: routerRestored,
    isEditing: appRouter.isEditing.value,
    itemType: appRouter.itemType.value,
    itemSlug: appRouter.itemSlug.value,
    studioSection: appRouter.studioSection.value,
  });

  return {
    routerRestored,
  };
}
