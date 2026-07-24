import { computed, ref, watch, type Ref } from "vue";
import type { UseAppRouterReturn } from "../../Core";
import { StageChromeStateSchema } from "../types";

export interface UseStageChromeStateDeps {
  appRouter: UseAppRouterReturn;
}

export interface UseStageChromeStateReturn {
  leftSidebarOpen: Ref<boolean>;
  rightSidebarOpen: Ref<boolean>;
  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;
  openLeftSidebar: () => void;
  setLeftSidebarOpen: (open: boolean) => void;
  setRightSidebarOpen: (open: boolean) => void;
}

export function useStageChromeState(
  deps: UseStageChromeStateDeps,
): UseStageChromeStateReturn {
  const { appRouter } = deps;

  const initialState = StageChromeStateSchema.parse({
    leftSidebarOpen: appRouter.leftSidebarOpen.value,
    rightSidebarOpen: appRouter.rightSidebarOpen.value,
  });

  const leftSidebarOpen = ref(initialState.leftSidebarOpen);
  const rightSidebarOpen = ref(initialState.rightSidebarOpen);

  const chromeState = computed(() => {
    return StageChromeStateSchema.parse({
      leftSidebarOpen: leftSidebarOpen.value,
      rightSidebarOpen: rightSidebarOpen.value,
    });
  });

  watch(
    () => appRouter.appMode.value,
    (appMode) => {
      const nextState = StageChromeStateSchema.parse({
        leftSidebarOpen: appRouter.leftSidebarOpen.value,
        rightSidebarOpen: appRouter.rightSidebarOpen.value,
      });

      if (appMode === "stage" || appMode === "studio") {
        leftSidebarOpen.value = nextState.leftSidebarOpen;
        rightSidebarOpen.value = nextState.rightSidebarOpen;
      }
    },
    { immediate: true },
  );

  watch(
    () => ({
      appMode: appRouter.appMode.value,
      leftSidebarOpen: appRouter.leftSidebarOpen.value,
      rightSidebarOpen: appRouter.rightSidebarOpen.value,
    }),
    (routerState) => {
      if (routerState.appMode === "stage") {
        return;
      }

      const nextState = StageChromeStateSchema.parse({
        leftSidebarOpen: routerState.leftSidebarOpen,
        rightSidebarOpen: routerState.rightSidebarOpen,
      });

      leftSidebarOpen.value = nextState.leftSidebarOpen;
      rightSidebarOpen.value = nextState.rightSidebarOpen;
    },
    { deep: true },
  );

  watch(
    chromeState,
    (state) => {
      if (appRouter.leftSidebarOpen.value !== state.leftSidebarOpen) {
        appRouter.setLeftSidebarOpen(state.leftSidebarOpen);
      }
      if (appRouter.rightSidebarOpen.value !== state.rightSidebarOpen) {
        appRouter.setRightSidebarOpen(state.rightSidebarOpen);
      }
    },
    { deep: true },
  );

  const toggleLeftSidebar = (): void => {
    leftSidebarOpen.value = !leftSidebarOpen.value;
  };

  const toggleRightSidebar = (): void => {
    rightSidebarOpen.value = !rightSidebarOpen.value;
  };

  const openLeftSidebar = (): void => {
    leftSidebarOpen.value = true;
  };

  const setLeftSidebarOpen = (open: boolean): void => {
    leftSidebarOpen.value = StageChromeStateSchema.parse({
      ...chromeState.value,
      leftSidebarOpen: open,
    }).leftSidebarOpen;
  };

  const setRightSidebarOpen = (open: boolean): void => {
    rightSidebarOpen.value = StageChromeStateSchema.parse({
      ...chromeState.value,
      rightSidebarOpen: open,
    }).rightSidebarOpen;
  };

  return {
    leftSidebarOpen,
    rightSidebarOpen,
    toggleLeftSidebar,
    toggleRightSidebar,
    openLeftSidebar,
    setLeftSidebarOpen,
    setRightSidebarOpen,
  };
}