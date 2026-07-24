import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import SetupStepIndicator from "../../../admin/features/Auth/components/setup/SetupStepIndicator.vue";
import type { SetupWizardStep } from "../../../admin/features/Auth/schemas/setupWizard";

function mountIndicator(currentStep: SetupWizardStep) {
  return mount(SetupStepIndicator, {
    props: { currentStep },
  });
}

describe("SetupStepIndicator", () => {
  it("renders the connected setup steps", () => {
    const wrapper = mountIndicator("account");

    expect(wrapper.text()).toContain("Account");
    expect(wrapper.text()).toContain("Passkey");
    expect(wrapper.text()).toContain("Recovery");
    expect(wrapper.find(".i-hugeicons\\:user-circle").exists()).toBe(true);
    expect(wrapper.find(".i-hugeicons\\:finger-print").exists()).toBe(true);
    expect(wrapper.find(".i-hugeicons\\:lock-password").exists()).toBe(true);

    wrapper.unmount();
  });

  it("marks the active, completed, and upcoming steps", () => {
    const wrapper = mountIndicator("passkey");
    const steps = wrapper.findAll("li");
    const connectors = wrapper.findAll("[aria-hidden='true'][data-state]");

    expect(steps).toHaveLength(3);
    expect(steps[0]?.attributes("data-state")).toBe("complete");
    expect(steps[1]?.attributes("data-state")).toBe("current");
    expect(steps[1]?.attributes("aria-current")).toBe("step");
    expect(steps[2]?.attributes("data-state")).toBe("upcoming");
    expect(connectors).toHaveLength(2);
    expect(connectors[0]?.attributes("data-state")).toBe("complete");
    expect(connectors[1]?.attributes("data-state")).toBe("upcoming");

    wrapper.unmount();
  });
});
