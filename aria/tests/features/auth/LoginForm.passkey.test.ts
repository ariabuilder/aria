import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalPublicKeyCredential = window.PublicKeyCredential;
const originalIsSecureContext = window.isSecureContext;

const {
  AlertDescriptionStub,
  AlertStub,
  AlertTitleStub,
  ButtonStub,
  CheckboxStub,
  InputOtpGroupStub,
  InputOtpSlotStub,
  InputOtpStub,
  InputStub,
  LabelStub,
  getAuthMethodAvailabilityMock,
  getLoginCaptchaConfigMock,
  loginUserMock,
  passkeyLoginOptionsMock,
  passkeyLoginVerifyMock,
  startAuthenticationMock,
} = vi.hoisted(() => {
  const { defineComponent, h } = require("vue") as typeof import("vue");

  const ButtonStub = defineComponent({
    inheritAttrs: false,
    props: {
      disabled: { type: Boolean, default: false },
      type: { type: String, default: "button" },
    },
    emits: ["click"],
    setup(props, { attrs, emit, slots }) {
      return () =>
        h(
          "button",
          {
            ...attrs,
            disabled: props.disabled,
            type: props.type,
            onClick: (event: MouseEvent) => emit("click", event),
          },
          slots.default?.(),
        );
    },
  });

  const InputStub = defineComponent({
    inheritAttrs: false,
    props: {
      modelValue: { type: String, default: "" },
    },
    emits: ["update:modelValue"],
    setup(props, { attrs, emit }) {
      return () =>
        h("input", {
          ...attrs,
          value: props.modelValue,
          onInput: (event: Event) => {
            const target = event.target;
            if (target instanceof HTMLInputElement) {
              emit("update:modelValue", target.value);
            }
          },
        });
    },
  });

  const CheckboxStub = defineComponent({
    inheritAttrs: false,
    props: {
      modelValue: { type: Boolean, default: false },
    },
    emits: ["update:modelValue"],
    setup(props, { attrs, emit }) {
      return () =>
        h("input", {
          ...attrs,
          checked: props.modelValue,
          type: "checkbox",
          onChange: (event: Event) => {
            const target = event.target;
            if (target instanceof HTMLInputElement) {
              emit("update:modelValue", target.checked);
            }
          },
        });
    },
  });

  const LabelStub = defineComponent({
    setup(_, { slots }) {
      return () => h("label", slots.default?.());
    },
  });

  const AlertStub = defineComponent({
    setup(_, { slots }) {
      return () => h("section", slots.default?.());
    },
  });

  const AlertTitleStub = defineComponent({
    setup(_, { slots }) {
      return () => h("strong", slots.default?.());
    },
  });

  const AlertDescriptionStub = defineComponent({
    setup(_, { slots }) {
      return () => h("p", slots.default?.());
    },
  });

  const InputOtpStub = defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  });

  const InputOtpGroupStub = defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  });

  const InputOtpSlotStub = defineComponent({
    setup() {
      return () => h("span");
    },
  });

  return {
    AlertDescriptionStub,
    AlertStub,
    AlertTitleStub,
    ButtonStub,
    CheckboxStub,
    InputOtpGroupStub,
    InputOtpSlotStub,
    InputOtpStub,
    InputStub,
    LabelStub,
    getAuthMethodAvailabilityMock: vi.fn(),
    getLoginCaptchaConfigMock: vi.fn(),
    loginUserMock: vi.fn(),
    passkeyLoginOptionsMock: vi.fn(),
    passkeyLoginVerifyMock: vi.fn(),
    startAuthenticationMock: vi.fn(),
  };
});

vi.mock("@/components/ui/alert", () => ({
  Alert: AlertStub,
  AlertDescription: AlertDescriptionStub,
  AlertTitle: AlertTitleStub,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ButtonStub,
}));

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: CheckboxStub,
}));

vi.mock("@/components/ui/input", () => ({
  Input: InputStub,
}));

vi.mock("@/components/ui/input-otp", () => ({
  InputOTP: InputOtpStub,
  InputOTPGroup: InputOtpGroupStub,
  InputOTPSlot: InputOtpSlotStub,
}));

vi.mock("@/components/ui/label", () => ({
  Label: LabelStub,
}));

vi.mock("@simplewebauthn/browser", () => ({
  startAuthentication: startAuthenticationMock,
}));

vi.mock("../../../admin/features/Auth/composables/useAuthApi", () => ({
  getAuthMethodAvailability: getAuthMethodAvailabilityMock,
  getLoginCaptchaConfig: getLoginCaptchaConfigMock,
  loginUser: loginUserMock,
  passkeyLoginOptions: passkeyLoginOptionsMock,
  passkeyLoginVerify: passkeyLoginVerifyMock,
}));

interface InputTarget {
  id: string;
  value: string;
}

function passkeyAvailability(enabled: boolean) {
  return {
    data: {
      passkey: { enabled, rpName: "Aria" },
      password: { enabled: true, recoveryOnly: true },
      magicLink: { enabled: false },
    },
  };
}

async function mountLoginForm(): Promise<VueWrapper> {
  const component = (
    await import("../../../admin/features/Auth/components/LoginForm.vue")
  ).default;
  const wrapper = mount(component);
  await flushPromises();
  return wrapper;
}

async function setInput(
  wrapper: VueWrapper,
  target: InputTarget,
): Promise<void> {
  const input = wrapper.get<HTMLInputElement>(`#${target.id}`);
  await input.setValue(target.value);
}

async function clickButton(wrapper: VueWrapper, text: string): Promise<void> {
  const button = wrapper
    .findAll("button")
    .find((candidate) => candidate.text().includes(text));
  expect(button, `button containing "${text}"`).toBeDefined();
  await button?.trigger("click");
}

describe("LoginForm passkey flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "PublicKeyCredential", {
      configurable: true,
      value: class PublicKeyCredential {},
    });
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });
    getAuthMethodAvailabilityMock.mockResolvedValue(passkeyAvailability(true));
    getLoginCaptchaConfigMock.mockResolvedValue({ data: { enabled: false } });
    passkeyLoginOptionsMock.mockResolvedValue({
      data: {
        challengeId: "7df68f0d-2689-4c4d-ae44-e2c0c2b62b3d",
        options: { challenge: "login-challenge" },
      },
    });
    startAuthenticationMock.mockResolvedValue({
      id: "credential-id",
      rawId: "credential-id",
      response: {
        clientDataJSON: "client-data",
        authenticatorData: "authenticator-data",
        signature: "signature",
      },
      type: "public-key",
      clientExtensionResults: {},
    });
    passkeyLoginVerifyMock.mockResolvedValue({
      data: {
        status: "error",
        message: "Passkey sign-in failed. Try again or use password.",
      },
    });
    loginUserMock.mockResolvedValue({
      data: {
        status: "totp_required",
        message: "Two-factor authentication code required",
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, "PublicKeyCredential", {
      configurable: true,
      value: originalPublicKeyCredential,
    });
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: originalIsSecureContext,
    });
  });

  it("hides passkey controls when passkeys are disabled for the workspace", async () => {
    getAuthMethodAvailabilityMock.mockResolvedValue(passkeyAvailability(false));

    const wrapper = await mountLoginForm();

    expect(wrapper.text()).not.toContain("Sign in with passkey");
    expect(wrapper.text()).not.toContain("or use recovery");
    expect(wrapper.find("#identifier").exists()).toBe(true);
    expect(wrapper.find("#password").exists()).toBe(true);

    wrapper.unmount();
  });

  it("hides password fields until the password link is opened", async () => {
    const wrapper = await mountLoginForm();

    expect(wrapper.text()).toContain("Sign in with passkey");
    expect(wrapper.text()).toContain("Sign in with password");
    expect(wrapper.find("#identifier").exists()).toBe(false);
    expect(wrapper.find("#password").exists()).toBe(false);

    await clickButton(wrapper, "Sign in with password");
    await flushPromises();

    expect(wrapper.find("#identifier").exists()).toBe(true);
    expect(wrapper.find("#password").exists()).toBe(true);
    expect(wrapper.text()).toContain("Hide password sign-in");

    wrapper.unmount();
  });

  it("signs in with passkey through typed auth actions", async () => {
    const wrapper = await mountLoginForm();

    await clickButton(wrapper, "Sign in with passkey");
    await flushPromises();

    expect(passkeyLoginOptionsMock).toHaveBeenCalledWith(undefined);
    expect(startAuthenticationMock).toHaveBeenCalledWith({
      optionsJSON: { challenge: "login-challenge" },
    });
    expect(passkeyLoginVerifyMock).toHaveBeenCalledWith({
      challengeId: "7df68f0d-2689-4c4d-ae44-e2c0c2b62b3d",
      response: expect.objectContaining({ id: "credential-id" }),
      rememberMe: false,
    });
    expect(loginUserMock).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it("shows a friendly message when passkey sign-in is cancelled", async () => {
    const notAllowed = new Error("cancelled");
    notAllowed.name = "NotAllowedError";
    startAuthenticationMock.mockRejectedValue(notAllowed);
    const wrapper = await mountLoginForm();

    await clickButton(wrapper, "Sign in with passkey");
    await flushPromises();

    expect(wrapper.text()).toContain("Passkey sign-in was cancelled.");
    expect(passkeyLoginVerifyMock).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it("submits password fallback through loginUser", async () => {
    const wrapper = await mountLoginForm();

    await clickButton(wrapper, "Sign in with password");
    await flushPromises();

    await setInput(wrapper, {
      id: "identifier",
      value: "admin@ariabuilder.io",
    });
    await setInput(wrapper, {
      id: "password",
      value: "recovery-password",
    });
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(loginUserMock).toHaveBeenCalledWith({
      identifier: "admin@ariabuilder.io",
      password: "recovery-password",
      rememberMe: false,
      captchaToken: undefined,
      totpCode: undefined,
    });
    expect(passkeyLoginOptionsMock).not.toHaveBeenCalled();

    wrapper.unmount();
  });
});
