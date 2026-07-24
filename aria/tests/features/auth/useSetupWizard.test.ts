import { mount } from "@vue/test-utils";
import { defineComponent, nextTick } from "vue";
import { describe, expect, it } from "vitest";

import { useSetupWizard } from "../../../admin/features/Auth/composables/useSetupWizard";
import { getStudioMessage } from "../../../admin/i18n/messages";

const t = (key: Parameters<typeof getStudioMessage>[1]) =>
  getStudioMessage("en", key);

const WizardHost = defineComponent({
  setup() {
    return useSetupWizard("passkey_shell", t);
  },
  template: "<div />",
});

function mountWizard() {
  const wrapper = mount(WizardHost);
  return {
    wrapper,
    wizard: wrapper.vm,
  };
}

describe("useSetupWizard", () => {
  it("requires a valid account step before advancing to passkey setup", async () => {
    Object.defineProperty(window, "PublicKeyCredential", {
      configurable: true,
      value: class PublicKeyCredential {},
    });

    const { wrapper, wizard } = mountWizard();

    await nextTick();

    expect(wizard.validateAccountStep()).toBe(false);
    expect(wizard.state.currentStep).toBe("account");
    expect(wizard.state.error).toBe("Username must be at least 3 characters.");

    wizard.formData.username = "admin";
    wizard.formData.email = "admin@example.com";

    expect(wizard.validateAccountStep()).toBe(true);
    expect(wizard.state.currentStep).toBe("passkey");
    expect(wizard.state.error).toBeNull();

    wrapper.unmount();
  });

  it("keeps setup blocked on recovery password mismatch", () => {
    const { wrapper, wizard } = mountWizard();

    wizard.formData.username = "admin";
    wizard.formData.email = "admin@example.com";
    wizard.formData.password = "correct-horse";
    wizard.formData.confirmPassword = "wrong-horse";
    wizard.goToStep("recovery");

    expect(wizard.validateRecoveryStep()).toBe(false);
    expect(wizard.state.currentStep).toBe("recovery");
    expect(wizard.state.error).toBe("Passwords do not match.");

    wrapper.unmount();
  });

  it("allows shell-mode passkey continuation when backend wiring is unavailable", async () => {
    const { wrapper, wizard } = mountWizard();

    await nextTick();
    wizard.goToStep("passkey");
    wizard.state.passkeyReadiness = "backend_unavailable";

    wizard.continueFromPasskey();

    expect(wizard.state.currentStep).toBe("recovery");
    expect(wizard.state.error).toBeNull();

    wrapper.unmount();
  });

  it("routes unsupported browsers to password setup after account validation", async () => {
    Reflect.deleteProperty(window, "PublicKeyCredential");

    const { wrapper, wizard } = mountWizard();

    await nextTick();

    wizard.formData.username = "admin";
    wizard.formData.email = "admin@example.com";

    expect(wizard.validateAccountStep()).toBe(true);
    expect(wizard.state.currentStep).toBe("recovery");
    expect(wizard.state.setupMode).toBe("password_legacy");

    wrapper.unmount();

    Object.defineProperty(window, "PublicKeyCredential", {
      configurable: true,
      value: class PublicKeyCredential {},
    });
  });

  it("switches to password setup on demand", () => {
    const { wrapper, wizard } = mountWizard();

    wizard.formData.username = "admin";
    wizard.formData.email = "admin@example.com";
    wizard.goToStep("passkey");

    wizard.switchToPasswordSetup();

    expect(wizard.state.currentStep).toBe("recovery");
    expect(wizard.state.setupMode).toBe("password_legacy");

    wrapper.unmount();
  });
});
