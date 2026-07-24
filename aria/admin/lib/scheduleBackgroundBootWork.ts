import { watch } from "vue";
import { traceStartup } from "@/lib/startupTrace";
import { useAppLoading } from "@/features/Composer/composables/useAppLoading";

const BACKGROUND_BOOT_IDLE_TIMEOUT_MS = 3000;

/**
 * Queue work until the Studio or Stage shell is ready, then run on idle.
 * Use for dashboard media, metrics, and other non-critical cold-boot fetches.
 */
export function scheduleBackgroundBootWork(
  task: () => void,
  options?: { label?: string },
): void {
  const { isStudioReady, isStageReady } = useAppLoading();
  const label = options?.label;

  const runOnIdle = (): void => {
    traceStartup("background-boot:scheduled", { label });
    const execute = (): void => {
      traceStartup("background-boot:run", { label });
      task();
    };

    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(execute, { timeout: BACKGROUND_BOOT_IDLE_TIMEOUT_MS });
    } else {
      setTimeout(execute, 0);
    }
  };

  if (isStudioReady.value || isStageReady.value) {
    runOnIdle();
    return;
  }

  const stop = watch(
    () => isStudioReady.value || isStageReady.value,
    (ready) => {
      if (!ready) return;
      stop();
      runOnIdle();
    },
  );
}
