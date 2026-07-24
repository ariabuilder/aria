import { describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";

const {
  loadFontOptionsMock,
  updateFamilyMock,
  updateHeadingOverrideMock,
  clearHeadingOverrideMock,
  clearAllHeadingOverridesMock,
  updateBodyOverrideMock,
  clearBodyOverrideMock,
  clearAllBodyOverridesMock,
} = vi.hoisted(() => ({
  loadFontOptionsMock: vi.fn().mockResolvedValue(undefined),
  updateFamilyMock: vi.fn(),
  updateHeadingOverrideMock: vi.fn(),
  clearHeadingOverrideMock: vi.fn(),
  clearAllHeadingOverridesMock: vi.fn(),
  updateBodyOverrideMock: vi.fn(),
  clearBodyOverrideMock: vi.fn(),
  clearAllBodyOverridesMock: vi.fn(),
}));

const typographyRef = ref({
  families: {
    heading: "Bricolage Grotesque",
    body: "Inter",
    mono: "JetBrains Mono",
  },
  headingOverrides: {},
  bodyOverrides: {},
  scale: [],
});

const fontOptionsRef = ref([
  {
    family: "Inter",
    label: "Inter",
  },
  {
    family: "Bricolage Grotesque",
    label: "Bricolage Grotesque",
  },
  {
    family: "JetBrains Mono",
    label: "JetBrains Mono",
  },
]);

vi.mock("../../../admin/features/Design/composables/useTypography", () => ({
  TYPOGRAPHY_FONTS_UPDATED_EVENT: "aria:typography-fonts-updated",
  useTypography: () => ({
    typography: typographyRef,
    fontOptions: fontOptionsRef,
    updateFamily: updateFamilyMock,
    updateHeadingOverride: updateHeadingOverrideMock,
    clearHeadingOverride: clearHeadingOverrideMock,
    clearAllHeadingOverrides: clearAllHeadingOverridesMock,
    updateBodyOverride: updateBodyOverrideMock,
    clearBodyOverride: clearBodyOverrideMock,
    clearAllBodyOverrides: clearAllBodyOverridesMock,
    loadFontOptions: loadFontOptionsMock,
  }),
}));

const DialogStub = defineComponent({
  props: {
    open: {
      type: Boolean,
      default: false,
    },
  },
  emits: ["update:open"],
  setup(_, { slots }) {
    return () => h("div", slots.default?.());
  },
});

const SlotStub = defineComponent({
  setup(_, { slots }) {
    return () => h("div", slots.default?.());
  },
});

describe("TypeFamilySelector", () => {
  it("renders assigned families without crashing on ref-backed typography state", async () => {
    const TypeFamilySelector = (
      await import("../../../admin/features/Design/components/TypeFamilySelector.vue")
    ).default;

    const wrapper = mount(TypeFamilySelector, {
      global: {
        stubs: {
          Dialog: DialogStub,
          DialogContent: SlotStub,
          DialogHeader: SlotStub,
          DialogTitle: SlotStub,
          Input: defineComponent({
            inheritAttrs: false,
            props: {
              modelValue: {
                type: String,
                default: "",
              },
            },
            emits: ["update:modelValue"],
            setup(props, { attrs, emit }) {
              return () =>
                h("input", {
                  ...attrs,
                  value: props.modelValue,
                  onInput: (event: Event) =>
                    emit(
                      "update:modelValue",
                      (event.target as HTMLInputElement).value,
                    ),
                });
            },
          }),
          ScrollArea: SlotStub,
        },
      },
    });

    await flushPromises();

    expect(loadFontOptionsMock).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("Bricolage Grotesque");
    expect(wrapper.text()).toContain("Inter");
    expect(wrapper.text()).toContain("JetBrains Mono");
    expect(wrapper.text()).toContain("Body Regular");
    expect(wrapper.text()).toContain("Body Small");

    wrapper.unmount();
  });
});
