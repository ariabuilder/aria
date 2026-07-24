import { describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { mount } from "@vue/test-utils";

vi.mock(
  "../../../admin/features/Studio/components/components/ComponentPreviewCard.vue",
  () => ({
    default: {
      props: ["variant", "componentId", "name", "viewport", "eager"],
      template: '<div data-test="component-preview-card" />',
    },
  }),
);

import ComponentPreviewPanel from "../../../admin/features/Studio/pages/components/ComponentPreviewPanel.vue";

const PassThrough = defineComponent({
  template: "<div><slot /></div>",
});

const ButtonStub = defineComponent({
  props: {
    disabled: {
      type: Boolean,
      default: false,
    },
    class: {
      type: String,
      default: "",
    },
  },
  emits: ["click"],
  template:
    '<button :class="$props.class" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
});

function mountPanel(props: Record<string, unknown>) {
  return mount(ComponentPreviewPanel, {
    props: {
      componentId: "aria.hero.split.v1",
      ...props,
    },
    global: {
      stubs: {
        Button: ButtonStub,
        Badge: PassThrough,
        Tooltip: PassThrough,
        TooltipContent: PassThrough,
        TooltipProvider: PassThrough,
        TooltipTrigger: PassThrough,
        DropdownMenu: PassThrough,
        DropdownMenuContent: PassThrough,
        DropdownMenuItem: PassThrough,
        DropdownMenuTrigger: PassThrough,
        ComponentPreviewCard: PassThrough,
      },
    },
  });
}

describe("ComponentPreviewPanel", () => {
  it("shows Aria Library label for Aria components", () => {
    const wrapper = mountPanel({
      componentSource: "aria",
      componentTier: "pro",
      componentLocked: true,
    });

    expect(wrapper.text()).toContain("Aria Library");
  });

  it("disables thumbnail refresh while pending", () => {
    const wrapper = mountPanel({
      componentSource: "aria",
      componentTier: "free",
      componentLocked: true,
      isThumbnailPending: true,
    });

    const refreshButton = wrapper.get('[data-test="refresh-thumbnail-button"]');
    expect(refreshButton.attributes("disabled")).toBeDefined();
  });

  it("emits refreshThumbnail from the rail action", async () => {
    const wrapper = mountPanel({
      componentSource: "custom",
      componentTier: "free",
      componentLocked: false,
      isThumbnailPending: false,
    });

    const refreshButton = wrapper.get('[data-test="refresh-thumbnail-button"]');
    expect(refreshButton.attributes("disabled")).toBeUndefined();

    await refreshButton.trigger("click");

    expect(wrapper.emitted("refreshThumbnail")).toHaveLength(1);
  });
});
