import { describe, expect, it } from "vitest";
import {
  CONFIRMATION_REGISTRY,
  getConfirmationCategory,
  getConfirmationCategoryLabel,
} from "../../../admin/features/Agent/lib/tools/confirmationRegistry";
import { SERVER_TOOL_NAMES } from "../../../admin/features/Agent/lib/tools/constants";

describe("confirmation registry", () => {
  it("maps known destructive tools to categories", () => {
    expect(CONFIRMATION_REGISTRY.aria_delete_document).toBe("delete_content");
    expect(CONFIRMATION_REGISTRY.aria_delete_collection).toBe("delete_content");
    expect(CONFIRMATION_REGISTRY.aria_delete_entry).toBe("delete_content");
    expect(CONFIRMATION_REGISTRY.aria_delete_node).toBe("delete_content");
    expect(CONFIRMATION_REGISTRY.aria_delete_media).toBe("delete_content");
    expect(CONFIRMATION_REGISTRY.aria_delete_redirect).toBe("delete_content");
    expect(CONFIRMATION_REGISTRY.aria_delete_class).toBe("delete_content");
    expect(CONFIRMATION_REGISTRY.aria_delete_custom_font).toBe(
      "delete_content",
    );
    expect(CONFIRMATION_REGISTRY.aria_manage_css_variables).toBe(
      "replace_variables",
    );
    expect(CONFIRMATION_REGISTRY.aria_publish_entry).toBe("publish");
  });

  it("returns null for non-destructive tools", () => {
    expect(getConfirmationCategory("aria_list_pages")).toBeNull();
    expect(getConfirmationCategory("aria_read_page")).toBeNull();
    expect(getConfirmationCategory("aria_insert_nodes")).toBeNull();
    expect(getConfirmationCategory("aria_save_document")).toBeNull();
  });

  it("all registry tool names exist in SERVER_TOOL_NAMES", () => {
    for (const toolName of Object.keys(CONFIRMATION_REGISTRY)) {
      expect(SERVER_TOOL_NAMES).toContain(toolName);
    }
  });

  it("produces user-facing labels for all categories", () => {
    const categories = ["delete_content", "replace_variables", "publish"] as const;
    for (const cat of categories) {
      expect(getConfirmationCategoryLabel(cat)).toBeTruthy();
    }
  });
});
