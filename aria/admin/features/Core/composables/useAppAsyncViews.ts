import { defineAsyncComponent, type AsyncComponentLoader } from "vue";

// Dedicated loaders so the same chunk is referenced by both the async
// component definitions and the imperative `preloadBuilderShell()` warmer.
const loadStudioApp: AsyncComponentLoader = () =>
  import("../../Studio/StudioApp.vue");
const loadStageApp: AsyncComponentLoader = () =>
  import("../../Stage/StageApp.vue");

const StudioApp = defineAsyncComponent({
  loader: loadStudioApp,
});

const StageApp = defineAsyncComponent({
  loader: loadStageApp,
});

/**
 * Imperatively kick off downloads of the Studio
 * + Stage shell chunks. Called from `useAppBootstrap.
 */
export async function preloadBuilderShell(): Promise<void> {
  await Promise.all([loadStudioApp(), loadStageApp()]);
}

export function useAppAsyncViews() {
  return {
    StudioApp,
    StageApp,
  };
}
