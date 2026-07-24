import { afterEach, describe, expect, it } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";

import CreateBreakpointDialog from "../../../admin/features/Design/dialogs/CreateBreakpointDialog.vue";

describe("CreateBreakpointDialog", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders translated guidance and requires a valid label and width", async () => {
    const wrapper = mount(CreateBreakpointDialog, {
      attachTo: document.body,
      props: {
        open: true,
        label: "",
        width: "",
      },
    });

    await flushPromises();

    expect(document.body.textContent).toContain("Add custom breakpoint");
    expect(document.body.textContent).toContain(
      "Maximum width is determined by the next breakpoint.",
    );

    const submit = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.includes("Add Breakpoint"));

    expect(submit).toBeDefined();
    expect(submit?.disabled).toBe(true);

    await wrapper.setProps({ label: "Wide", width: "1440" });
    expect(submit?.disabled).toBe(false);

    submit?.click();
    await flushPromises();

    expect(wrapper.emitted("create")).toHaveLength(1);
    wrapper.unmount();
  });
});
