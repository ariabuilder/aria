import { describe, expect, it } from "vitest";
import {
  finishAgentBuild,
  finishAgentRun,
  recordAgentBuildSection,
  registerAgentRun,
  startAgentBuild,
  useAgentRuntimeStatus,
} from "../../../admin/features/Agent/client/composables/useAgentRuntimeStatus";

describe("agent runtime status", () => {
  it("stays active until every registered background run finishes", () => {
    const status = useAgentRuntimeStatus();
    registerAgentRun("run-a");
    registerAgentRun("run-b");

    expect(status.isWorking.value).toBe(true);
    expect(status.activeRunCount.value).toBe(2);

    finishAgentRun("run-a");
    expect(status.isWorking.value).toBe(true);

    finishAgentRun("run-b");
    expect(status.isWorking.value).toBe(false);
  });

  it("tracks the latest completed section count for an active build", () => {
    const status = useAgentRuntimeStatus();
    startAgentBuild("build-a");

    expect(status.isBuilding.value).toBe(true);
    expect(status.completedSectionCount.value).toBe(0);

    recordAgentBuildSection("build-a", 1);
    recordAgentBuildSection("build-a", 2);
    expect(status.currentBuild.value).toMatchObject({
      runId: "build-a",
      sequence: 2,
      completedSections: 2,
    });
    expect(status.currentBuildSequence.value).toBe(2);
    expect(status.completedSectionCount.value).toBe(2);

    finishAgentBuild("build-a");
    expect(status.isBuilding.value).toBe(false);
    expect(status.completedSectionCount.value).toBe(0);
  });
});
