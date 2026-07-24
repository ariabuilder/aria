export type ScheduledTask = Readonly<{
  name: string;
  run: () => Promise<void>;
}>;

/** Runs every scheduled subsystem even when an earlier one fails. */
export async function runScheduledTasks(
  tasks: readonly ScheduledTask[],
): Promise<void> {
  const failures: Error[] = [];
  for (const task of tasks) {
    try {
      await task.run();
    } catch (cause) {
      const error =
        cause instanceof Error ? cause : new Error("Unknown scheduled task error");
      failures.push(error);
      console.error(
        JSON.stringify({
          event: "worker.scheduled.failed",
          task: task.name,
          error: error.message,
        }),
      );
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "One or more scheduled tasks failed");
  }
}
