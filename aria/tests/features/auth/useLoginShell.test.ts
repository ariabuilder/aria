import { mount } from "@vue/test-utils";
import { defineComponent, nextTick } from "vue";
import { afterEach, describe, expect, it } from "vitest";

import { useLoginShell } from "../../../admin/features/Auth/composables/useLoginShell";

const originalPublicKeyCredential = window.PublicKeyCredential;

const LoginShellHost = defineComponent({
  setup() {
    return useLoginShell();
  },
  template: "<div />",
});

function mountLoginShell() {
  const wrapper = mount(LoginShellHost);
  return {
    wrapper,
    shell: wrapper.vm,
  };
}

describe("useLoginShell", () => {
  afterEach(() => {
    Object.defineProperty(window, "PublicKeyCredential", {
      configurable: true,
      value: originalPublicKeyCredential,
    });
  });

  it("expands password options when the browser does not support passkeys", async () => {
    Reflect.deleteProperty(window, "PublicKeyCredential");

    const { wrapper, shell } = mountLoginShell();

    await nextTick();

    expect(shell.state.passkeyReadiness).toBe("unsupported");
    expect(shell.passkeyVisible).toBe(false);
    expect(shell.state.passwordOptionsOpen).toBe(true);

    wrapper.unmount();
  });

  it("enables passkey sign-in when browser supports passkeys", async () => {
    Object.defineProperty(window, "PublicKeyCredential", {
      configurable: true,
      value: class PublicKeyCredential {},
    });

    const { wrapper, shell } = mountLoginShell();

    await nextTick();

    expect(shell.state.passkeyReadiness).toBe("ready");
    expect(shell.passkeyVisible).toBe(true);
    expect(shell.passkeyDisabled).toBe(false);
    expect(shell.state.passwordOptionsOpen).toBe(false);
    expect(shell.passkeyStatusMessage).toBeNull();

    wrapper.unmount();
  });

  it("lets users toggle password sign-in manually", async () => {
    const { wrapper, shell } = mountLoginShell();

    await nextTick();
    expect(shell.state.passwordOptionsOpen).toBe(false);

    shell.togglePasswordOptions();
    expect(shell.state.passwordOptionsOpen).toBe(true);
    expect(shell.passwordOptionsLabel).toBe("Hide password sign-in");

    shell.togglePasswordOptions();
    expect(shell.state.passwordOptionsOpen).toBe(false);
    expect(shell.passwordOptionsLabel).toBe("Sign in with password");

    wrapper.unmount();
  });

  it("shows password form when passkeys are hidden or options are open", async () => {
    Object.defineProperty(window, "PublicKeyCredential", {
      configurable: true,
      value: class PublicKeyCredential {},
    });

    const { wrapper, shell } = mountLoginShell();

    await nextTick();

    expect(shell.passkeyVisible).toBe(true);
    expect(shell.passwordVisible).toBe(false);

    shell.togglePasswordOptions();
    expect(shell.passwordVisible).toBe(true);

    shell.togglePasswordOptions();
    expect(shell.passwordVisible).toBe(false);

    shell.setPasskeyReadiness("unsupported");
    expect(shell.passwordVisible).toBe(true);

    wrapper.unmount();
  });

  it("hides passkey controls when passkeys are disabled by the workspace", async () => {
    const { wrapper, shell } = mountLoginShell();

    await nextTick();

    shell.setPasskeyReadiness("backend_unavailable");

    expect(shell.state.passkeyReadiness).toBe("backend_unavailable");
    expect(shell.passkeyVisible).toBe(false);
    expect(shell.passkeyDisabled).toBe(true);
    expect(shell.state.passwordOptionsOpen).toBe(true);
    expect(shell.passkeyStatusMessage).toBe(
      "Passkey sign-in is disabled for this workspace. Use password sign-in.",
    );

    wrapper.unmount();
  });
});
