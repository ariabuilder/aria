import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { describe, expect, it, vi } from "vitest";

import setupAstroVueApp from "../../../admin/astro-vue-app";
import { useStudioI18n } from "../../../admin/i18n";

const I18nConsumer = defineComponent({
  setup() {
    return { t: useStudioI18n().t };
  },
  template: "<p>{{ t('auth.signIn') }}</p>",
});

describe("Astro Vue bootstrap", () => {
  it("provides Studio i18n to a standalone Vue island", () => {
    const warning = vi.fn();
    const wrapper = mount(I18nConsumer, {
      global: {
        config: { warnHandler: warning },
        plugins: [{ install: setupAstroVueApp }],
      },
    });

    expect(wrapper.text()).toBe("Sign in");
    expect(warning).not.toHaveBeenCalled();
  });
});
