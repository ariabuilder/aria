import { describe, expect, it } from "vitest";
import { SERVER_TOOL_NAMES } from "../../../admin/features/Agent/lib/tools/constants";
import {
  getServerToolPolicy,
  resolveToolPolicy,
} from "../../../admin/features/Agent/lib/policy/toolPolicy";

describe("agent tool policy", () => {
  it("defines a validated policy for every server tool", () => {
    for (const toolName of SERVER_TOOL_NAMES) {
      expect(getServerToolPolicy(toolName).toolName).toBe(toolName);
    }
  });

  it("requires confirmation for every current delete tool", () => {
    for (const toolName of SERVER_TOOL_NAMES.filter((name) =>
      name.startsWith("aria_delete_"),
    )) {
      expect(getServerToolPolicy(toolName)).toMatchObject({
        risk: "destructive",
        confirmation: "always",
        confirmationCategory: "delete_content",
      });
    }
  });

  it("does not resolve unknown tools", () => {
    expect(resolveToolPolicy("aria_unknown")).toBeNull();
  });

  it("only advertises exact reversibility when durable undo is implemented", () => {
    expect(getServerToolPolicy("aria_mutate_node").reversibility).toBe("exact");
    expect(
      getServerToolPolicy("aria_save_design_system_typography").reversibility,
    ).toBe("none");
    expect(getServerToolPolicy("aria_update_site_settings").reversibility).toBe(
      "none",
    );
    expect(getServerToolPolicy("aria_publish_page").reversibility).toBe(
      "compensating",
    );
  });
});
