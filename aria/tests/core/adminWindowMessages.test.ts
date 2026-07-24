import { describe, expect, it } from "vitest";

import {
  createWireframeModeMessage,
  parseOpenCommandBarMessage,
} from "../../admin/features/Core/composables/adminWindowMessages";

describe("adminWindowMessages", () => {
  it("parses valid open-command-bar messages", () => {
    expect(
      parseOpenCommandBarMessage({
        type: "open-command-bar",
      }),
    ).toEqual({
      type: "open-command-bar",
    });
  });

  it("rejects unrelated or malformed command-bar messages", () => {
    expect(
      parseOpenCommandBarMessage({
        source: "aria-composer",
        type: "select-node",
      }),
    ).toBeNull();

    expect(
      parseOpenCommandBarMessage({
        type: "open-command-bar",
        payload: { unexpected: true },
      }),
    ).toBeNull();
  });

  it("creates validated wireframe mode messages", () => {
    expect(createWireframeModeMessage(true)).toEqual({
      type: "set-wireframe-mode",
      payload: {
        enabled: true,
      },
    });
  });
});
