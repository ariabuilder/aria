import { afterEach, describe, expect, it, vi } from "vitest";

import { runScheduledTasks } from "../../worker/scheduled-tasks";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("scheduled task isolation", () => {
  it("continues in order after a task fails and reports the aggregate failure", async () => {
    const calls: string[] = [];
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      runScheduledTasks([
        {
          name: "first",
          run: async () => {
            calls.push("first");
            throw new Error("first failed");
          },
        },
        {
          name: "second",
          run: async () => {
            calls.push("second");
          },
        },
      ]),
    ).rejects.toThrow("One or more scheduled tasks failed");

    expect(calls).toEqual(["first", "second"]);
    expect(log).toHaveBeenCalledWith(
      JSON.stringify({
        event: "worker.scheduled.failed",
        task: "first",
        error: "first failed",
      }),
    );
  });

  it("resolves when every scheduled task succeeds", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    await expect(
      runScheduledTasks([{ name: "healthy", run }]),
    ).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledOnce();
  });
});
