import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

describe("scheduleBackgroundBootWork", () => {
  const idleCallbacks: Array<() => void> = [];

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    idleCallbacks.length = 0;

    vi.stubGlobal(
      "requestIdleCallback",
      (cb: () => void) => {
        idleCallbacks.push(cb);
        return 1;
      },
    );

    const { useAppLoading } = await import(
      "../../admin/features/Composer/composables/useAppLoading"
    );
    useAppLoading().reset();
  });

  it("does not run the task until the shell is ready", async () => {
    const task = vi.fn();
    const { scheduleBackgroundBootWork } = await import(
      "../../admin/lib/scheduleBackgroundBootWork"
    );

    scheduleBackgroundBootWork(task, { label: "test" });
    expect(task).not.toHaveBeenCalled();
    expect(idleCallbacks).toHaveLength(0);
  });

  it("runs the task on idle after setStudioReady", async () => {
    const task = vi.fn();
    const { scheduleBackgroundBootWork } = await import(
      "../../admin/lib/scheduleBackgroundBootWork"
    );
    const { useAppLoading } = await import(
      "../../admin/features/Composer/composables/useAppLoading"
    );

    scheduleBackgroundBootWork(task, { label: "test" });
    useAppLoading().setStudioReady(true);
    await nextTick();

    expect(idleCallbacks).toHaveLength(1);
    idleCallbacks[0]();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("runs immediately on idle when shell is already ready", async () => {
    const task = vi.fn();
    const { useAppLoading } = await import(
      "../../admin/features/Composer/composables/useAppLoading"
    );
    useAppLoading().setStudioReady(true);

    const { scheduleBackgroundBootWork } = await import(
      "../../admin/lib/scheduleBackgroundBootWork"
    );
    scheduleBackgroundBootWork(task);

    expect(idleCallbacks).toHaveLength(1);
    idleCallbacks[0]();
    expect(task).toHaveBeenCalledTimes(1);
  });
});
