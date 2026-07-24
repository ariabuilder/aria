import { describe, expect, it } from "vitest";
import { createAgentCanvasFollowController } from "../../../admin/features/Stage/composables/useAgentCanvasBuildPresentation";

describe("Agent canvas build smart-follow", () => {
  it("follows only the active build until the user interacts", () => {
    const follow = createAgentCanvasFollowController();
    follow.start("run-a");

    expect(follow.shouldFollow("run-a")).toBe(true);
    expect(follow.shouldFollow("run-b")).toBe(false);

    follow.disable();
    expect(follow.shouldFollow("run-a")).toBe(false);
  });

  it("does not let an older run finish a newer build", () => {
    const follow = createAgentCanvasFollowController();
    follow.start("run-a");
    follow.start("run-b");
    follow.finish("run-a");

    expect(follow.shouldFollow("run-b")).toBe(true);

    follow.finish("run-b");
    expect(follow.activeRunId()).toBeNull();
  });
});
