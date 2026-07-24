/**
 * ForgotPasswordForm tests
 *
 * @vitest-environment jsdom
 */

import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { requestPasswordResetMock } = vi.hoisted(() => ({
  requestPasswordResetMock: vi.fn(),
}));

vi.mock("../../../admin/features/Auth", async () => {
  const actual = await vi.importActual<
    typeof import("../../../admin/features/Auth")
  >("../../../admin/features/Auth");

  return {
    ...actual,
    requestPasswordReset: requestPasswordResetMock,
  };
});

const { AlertDescriptionStub, AlertStub, AlertTitleStub, ButtonStub, InputStub, LabelStub } =
  vi.hoisted(() => {
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

    const LabelStub = defineComponent({
      template: "<label><slot /></label>",
    });

    const AlertStub = defineComponent({
      template: '<div role="alert"><slot /></div>',
    });

    const AlertTitleStub = defineComponent({
      template: "<strong><slot /></strong>",
    });

    const AlertDescriptionStub = defineComponent({
      template: "<p><slot /></p>",
    });

    return {
      AlertDescriptionStub,
      AlertStub,
      AlertTitleStub,
      ButtonStub,
      InputStub,
      LabelStub,
    };
  });

async function mountForgotPasswordForm() {
  const { default: ForgotPasswordForm } = await import(
    "../../../admin/features/Auth/components/ForgotPasswordForm.vue"
  );

  return mount(ForgotPasswordForm, {
    global: {
      stubs: {
        Alert: AlertStub,
        AlertDescription: AlertDescriptionStub,
        AlertTitle: AlertTitleStub,
        Button: ButtonStub,
        Input: InputStub,
        Label: LabelStub,
      },
    },
  });
}

describe("ForgotPasswordForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a validation error for invalid emails without calling the Auth helper", async () => {
    const wrapper = await mountForgotPasswordForm();

    await wrapper.find("#email").setValue("not-an-email");
    await wrapper.find("form").trigger("submit.prevent");
    await flushPromises();

    expect(requestPasswordResetMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("A valid email address is required");

    wrapper.unmount();
  });

  it("submits forgot-password requests through the Auth helper and clears the email on success", async () => {
    requestPasswordResetMock.mockResolvedValue({
      data: {
        success: true,
        message: "If that email exists, a reset link has been sent.",
      },
    });

    const wrapper = await mountForgotPasswordForm();

    await wrapper.find("#email").setValue("andy@example.com");
    await wrapper.find("form").trigger("submit.prevent");
    await flushPromises();

    expect(requestPasswordResetMock).toHaveBeenCalledWith({
      email: "andy@example.com",
    });
    expect(wrapper.text()).toContain(
      "If that email exists, a reset link has been sent.",
    );
    expect((wrapper.find("#email").element as HTMLInputElement).value).toBe("");

    wrapper.unmount();
  });
});
