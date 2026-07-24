import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import SettingsRow from "../../../../admin/features/Studio/settings/components/SettingsRow.vue";

describe("SettingsRow", () => {
  it("uses the standard site-settings title and description treatment", () => {
    const wrapper = mount(SettingsRow, {
      props: {
        label: "Visitor analytics",
        description: "Scripts are imported automatically to your Aria site.",
        inputId: "analytics-toggle",
      },
      slots: {
        default: '<input id="analytics-toggle" />',
      },
    });

    const label = wrapper.get("label");
    const description = wrapper.get("p");

    expect(label.classes()).toEqual(
      expect.arrayContaining([
        "block",
        "text-sm",
        "font-medium",
        "text-foreground",
      ]),
    );
    expect(label.classes()).not.toContain("whitespace-nowrap");
    expect(description.classes()).toEqual(
      expect.arrayContaining([
        "mt-1",
        "text-xs",
        "text-muted-foreground",
      ]),
    );
    expect(description.classes()).not.toContain("text-muted-foreground/70");
  });
});
