import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import FlickeringGridBackdrop from "../../../admin/features/Studio/core/components/FlickeringGridBackdrop.vue";

describe("FlickeringGridBackdrop", () => {
  it("uses the localized bottom-center mask without changing bottom origin", () => {
    const centered = mount(FlickeringGridBackdrop, {
      props: { origin: "bottom-center" },
      global: { stubs: { FlickeringGrid: true } },
    });
    const bottom = mount(FlickeringGridBackdrop, {
      props: { origin: "bottom" },
      global: { stubs: { FlickeringGrid: true } },
    });

    expect(centered.get("span").classes()).toContain(
      "flickering-bottom-center-grid-mask",
    );
    expect(bottom.get("span").classes()).toContain(
      "flickering-bottom-grid-mask",
    );
  });
});
