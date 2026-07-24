import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import type { ComponentPublicInstance } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalPublicKeyCredential = window.PublicKeyCredential;
const originalIsSecureContext = window.isSecureContext;

const {
  AlertDescriptionStub,
  AlertStub,
  AlertTitleStub,
  ButtonStub,
  InputStub,
  LabelStub,
  beginPasskeySetupMock,
  completePasskeySetupMock,
  createFirstAdminMock,
  getAuthMethodAvailabilityMock,
  startRegistrationMock,
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
    setup(props, { attrs, emit, expose }) {
      let input: HTMLInputElement | null = null;
      expose({ focus: () => input?.focus() });
      return () =>
        h("input", {
          ...attrs,
          ref: (element: Element | ComponentPublicInstance | null) => {
            input = element instanceof HTMLInputElement ? element : null;
          },
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

  return {
    AlertDescriptionStub,
    AlertStub,
    AlertTitleStub,
    ButtonStub,
    InputStub,
    LabelStub,
    beginPasskeySetupMock: vi.fn(),
    completePasskeySetupMock: vi.fn(),
    createFirstAdminMock: vi.fn(),
    getAuthMethodAvailabilityMock: vi.fn(),
    startRegistrationMock: vi.fn(),
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

vi.mock("@/components/ui/input", () => ({
  Input: InputStub,
}));

vi.mock("@/components/ui/label", () => ({
  Label: LabelStub,
}));

vi.mock("@simplewebauthn/browser", () => ({
  startRegistration: startRegistrationMock,
}));

vi.mock("../../../admin/features/Auth/composables/useAuthApi", () => ({
  beginPasskeySetup: beginPasskeySetupMock,
  completePasskeySetup: completePasskeySetupMock,
  createFirstAdmin: createFirstAdminMock,
  getAuthMethodAvailability: getAuthMethodAvailabilityMock,
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

async function mountSetupForm(): Promise<VueWrapper> {
  const component = (
    await import("../../../admin/features/Auth/components/SetupForm.vue")
  ).default;
  const wrapper = mount(component);
  await flushPromises();
  return wrapper;
}

async function setInput(wrapper: VueWrapper, target: InputTarget): Promise<void> {
  const input = wrapper.get<HTMLInputElement>(`#${target.id}`);
  await input.setValue(target.value);
}

async function clickButton(wrapper: VueWrapper, text: string): Promise<void> {
  const button = wrapper
    .findAll("button")
    .find((candidate) => candidate.text().includes(text));
  expect(button, `button containing "${text}"`).toBeDefined();
  if (button?.attributes("type") === "submit") {
    await wrapper.get("form").trigger("submit");
    return;
  }
  await button?.trigger("click");
}

describe("SetupForm passkey flow", () => {
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
    beginPasskeySetupMock.mockResolvedValue({
      data: {
        pendingSetupId: "de008119-35c5-42a3-ad66-6e6b620838dc",
        challengeId: "7df68f0d-2689-4c4d-ae44-e2c0c2b62b3d",
        options: { challenge: "register-challenge" },
      },
    });
    startRegistrationMock.mockResolvedValue({
      id: "credential-id",
      rawId: "credential-id",
      response: {
        clientDataJSON: "client-data",
        attestationObject: "attestation",
      },
      type: "public-key",
      clientExtensionResults: {},
    });
    completePasskeySetupMock.mockResolvedValue({
      data: {
        success: true,
        user: {
          id: "8cc4c08c-2d47-456c-ab66-27a7816db992",
          username: "admin",
          email: "admin@ariabuilder.io",
          role: "administrator",
          totpEnabled: false,
          preferences: {},
        },
      },
    });
    createFirstAdminMock.mockResolvedValue({
      data: { success: true },
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

  it("advances from the account step when Enter submits the form", async () => {
    const wrapper = await mountSetupForm();

    await setInput(wrapper, { id: "setup-username", value: "admin" });
    await setInput(wrapper, {
      id: "setup-email",
      value: "admin@ariabuilder.io",
    });
    await wrapper.get("form").trigger("submit");

    expect(wrapper.text()).toContain("Prepare secure sign-in");
    expect(beginPasskeySetupMock).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it("keeps the account step active when Enter submits invalid account details", async () => {
    const wrapper = await mountSetupForm();

    await setInput(wrapper, { id: "setup-username", value: "ad" });
    await wrapper.get("form").trigger("submit");

    expect(wrapper.text()).toContain("Username must be at least 3 characters.");
    expect(wrapper.text()).not.toContain("Prepare secure sign-in");
    expect(wrapper.get("button").attributes("type")).toBe("submit");

    wrapper.unmount();
  });

  it("runs account to passkey to recovery and completes passkey setup", async () => {
    const wrapper = await mountSetupForm();

    await setInput(wrapper, { id: "setup-username", value: "admin" });
    await setInput(wrapper, {
      id: "setup-email",
      value: "admin@ariabuilder.io",
    });
    await clickButton(wrapper, "Continue");
    await flushPromises();

    expect(wrapper.text()).toContain("Prepare secure sign-in");
    expect(beginPasskeySetupMock).not.toHaveBeenCalled();

    const focusSpy = vi.spyOn(HTMLInputElement.prototype, "focus");
    await clickButton(wrapper, "Continue");
    await flushPromises();

    expect(beginPasskeySetupMock).toHaveBeenCalledWith({
      username: "admin",
      email: "admin@ariabuilder.io",
    });
    expect(startRegistrationMock).toHaveBeenCalledWith({
      optionsJSON: { challenge: "register-challenge" },
    });
    expect(wrapper.text()).toContain("Set a recovery password");
    expect(focusSpy).toHaveBeenCalled();
    expect(
      wrapper.get<HTMLInputElement>('input[name="username"]').element.value,
    ).toBe("admin");

    await setInput(wrapper, {
      id: "setup-password",
      value: "recovery-password",
    });
    await setInput(wrapper, {
      id: "setup-confirm-password",
      value: "recovery-password",
    });
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(completePasskeySetupMock).toHaveBeenCalledWith({
      pendingSetupId: "de008119-35c5-42a3-ad66-6e6b620838dc",
      challengeId: "7df68f0d-2689-4c4d-ae44-e2c0c2b62b3d",
      response: expect.objectContaining({ id: "credential-id" }),
      password: "recovery-password",
      confirmPassword: "recovery-password",
      deviceName: "First passkey",
    });
    expect(createFirstAdminMock).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it("keeps users on the passkey step when browser registration is cancelled", async () => {
    const notAllowed = new Error("cancelled");
    notAllowed.name = "NotAllowedError";
    startRegistrationMock.mockRejectedValue(notAllowed);
    const wrapper = await mountSetupForm();

    await setInput(wrapper, { id: "setup-username", value: "admin" });
    await setInput(wrapper, {
      id: "setup-email",
      value: "admin@ariabuilder.io",
    });
    await clickButton(wrapper, "Continue");
    await clickButton(wrapper, "Continue");
    await flushPromises();

    expect(wrapper.text()).toContain(
      "Passkey setup was cancelled. Try again when you're ready.",
    );
    expect(wrapper.text()).toContain("Prepare secure sign-in");
    expect(completePasskeySetupMock).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it("skips passkey setup and uses createFirstAdmin when passkeys are disabled", async () => {
    getAuthMethodAvailabilityMock.mockResolvedValue(passkeyAvailability(false));
    const wrapper = await mountSetupForm();

    await setInput(wrapper, { id: "setup-username", value: "admin" });
    await setInput(wrapper, {
      id: "setup-email",
      value: "admin@ariabuilder.io",
    });
    await clickButton(wrapper, "Continue");

    expect(wrapper.text()).toContain("Set a recovery password");

    await setInput(wrapper, {
      id: "setup-password",
      value: "recovery-password",
    });
    await setInput(wrapper, {
      id: "setup-confirm-password",
      value: "recovery-password",
    });
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(createFirstAdminMock).toHaveBeenCalledWith({
      username: "admin",
      email: "admin@ariabuilder.io",
      password: "recovery-password",
      confirmPassword: "recovery-password",
    });
    expect(beginPasskeySetupMock).not.toHaveBeenCalled();
    expect(completePasskeySetupMock).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it("skips passkey setup for unsupported browsers and uses createFirstAdmin", async () => {
    Reflect.deleteProperty(window, "PublicKeyCredential");
    const wrapper = await mountSetupForm();

    await setInput(wrapper, { id: "setup-username", value: "admin" });
    await setInput(wrapper, {
      id: "setup-email",
      value: "admin@ariabuilder.io",
    });
    await clickButton(wrapper, "Continue");

    expect(wrapper.text()).toContain("Set a recovery password");
    expect(wrapper.text()).not.toContain("Prepare secure sign-in");

    await setInput(wrapper, {
      id: "setup-password",
      value: "recovery-password",
    });
    await setInput(wrapper, {
      id: "setup-confirm-password",
      value: "recovery-password",
    });
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(createFirstAdminMock).toHaveBeenCalledWith({
      username: "admin",
      email: "admin@ariabuilder.io",
      password: "recovery-password",
      confirmPassword: "recovery-password",
    });
    expect(beginPasskeySetupMock).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it("uses createFirstAdmin when the user chooses password setup on the passkey step", async () => {
    const wrapper = await mountSetupForm();

    await setInput(wrapper, { id: "setup-username", value: "admin" });
    await setInput(wrapper, {
      id: "setup-email",
      value: "admin@ariabuilder.io",
    });
    await clickButton(wrapper, "Continue");
    await clickButton(wrapper, "Set up with password instead");

    expect(wrapper.text()).toContain("Set a recovery password");

    await setInput(wrapper, {
      id: "setup-password",
      value: "recovery-password",
    });
    await setInput(wrapper, {
      id: "setup-confirm-password",
      value: "recovery-password",
    });
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(createFirstAdminMock).toHaveBeenCalledWith({
      username: "admin",
      email: "admin@ariabuilder.io",
      password: "recovery-password",
      confirmPassword: "recovery-password",
    });
    expect(beginPasskeySetupMock).not.toHaveBeenCalled();
    expect(completePasskeySetupMock).not.toHaveBeenCalled();

    wrapper.unmount();
  });
});
