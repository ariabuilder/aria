/**
 * ResetPasswordForm tests
 *
 * @vitest-environment jsdom
 */

import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { confirmPasswordResetMock } = vi.hoisted(() => ({
  confirmPasswordResetMock: vi.fn(),
}));

vi.mock("../../../admin/features/Auth", async () => {
  const actual = await vi.importActual<
    typeof import("../../../admin/features/Auth")
  >("../../../admin/features/Auth");

  return {
    ...actual,
    confirmPasswordReset: confirmPasswordResetMock,
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

async function mountResetPasswordForm(token = "reset-token") {
  const { default: ResetPasswordForm } = await import(
    "../../../admin/features/Auth/components/ResetPasswordForm.vue"
  );

  return mount(ResetPasswordForm, {
    props: { token },
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

describe("ResetPasswordForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows validation feedback for mismatched passwords without calling the Auth helper", async () => {
    const wrapper = await mountResetPasswordForm();

    await wrapper.find("#reset-password").setValue("StrongPass123!");
    await wrapper.find("#reset-confirm-password").setValue("DifferentPass123!");
    await wrapper.find("form").trigger("submit.prevent");
    await flushPromises();

    expect(confirmPasswordResetMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("Passwords do not match");

    wrapper.unmount();
  });

  it("submits valid reset requests through the Auth helper and schedules login redirect", async () => {
    confirmPasswordResetMock.mockResolvedValue({
      data: {
        success: true,
        message: "Password has been reset. Please log in.",
      },
    });

    const setTimeoutSpy = vi
      .spyOn(window, "setTimeout")
      .mockImplementation(() => {
        return 0 as unknown as ReturnType<typeof window.setTimeout>;
      });

    const wrapper = await mountResetPasswordForm();

    await wrapper.find("#reset-password").setValue("StrongPass123!");
    await wrapper.find("#reset-confirm-password").setValue("StrongPass123!");
    await wrapper.find("form").trigger("submit.prevent");
    await flushPromises();

    expect(confirmPasswordResetMock).toHaveBeenCalledWith({
      token: "reset-token",
      newPassword: "StrongPass123!",
    });
    expect(wrapper.text()).toContain("Password has been reset. Please log in.");
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2000);

    wrapper.unmount();
  });
});
