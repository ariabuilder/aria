import { mount } from "@vue/test-utils";
import { defineComponent, markRaw } from "vue";
import { describe, expect, it } from "vitest";

import AuthLayout from "../../../admin/features/Auth/components/AuthLayout.vue";

const FormStub = defineComponent({
  name: "FormStub",
  template: '<form data-testid="auth-form" />',
});

function mountAuthLayout() {
  return mount(AuthLayout, {
    props: {
      heading: 'Welcome to <span class="text-primary">Aria</span>',
      tagline: "Your Studio is ready.",
      formTitle: "Sign in",
      formDescription: "Access your workspace.",
      formComponent: markRaw(FormStub),
    },
    global: {
      stubs: {
        DbDotGridBackdrop: true,
      },
    },
  });
}

describe("AuthLayout", () => {
  it("inherits dark mode from the document instead of forcing it locally", () => {
    const wrapper = mountAuthLayout();

    expect(wrapper.classes()).not.toContain("dark");
    expect(wrapper.classes()).toContain("bg-background");
    expect(wrapper.find('[data-testid="auth-form"]').exists()).toBe(true);

    wrapper.unmount();
  });
});
