import { describe, expect, it } from "vitest";
import { shouldRetargetComposerShellTransition } from "../../../admin/features/Core/composables/useShellModeTransitionOrchestration";

describe("Composer shell transition policy", () => {
  it("does not start a shell overlay for a steady-state Composer item switch", () => {
    expect(
      shouldRetargetComposerShellTransition({
        isActive: false,
        direction: null,
      }),
    ).toBe(false);
  });

  it("only retargets a stage key during an active Composer entry", () => {
    expect(
      shouldRetargetComposerShellTransition({
        isActive: true,
        direction: "to-composer",
      }),
    ).toBe(true);
    expect(
      shouldRetargetComposerShellTransition({
        isActive: true,
        direction: "to-studio",
      }),
    ).toBe(false);
  });
});
