import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

const stageMarkupPreviewState = vi.hoisted(() => ({
  isOpen: null as any,
  markup: null as any,
  stylesheet: null as any,
  setOpen: vi.fn(),
  keepOpenOnHover: vi.fn(),
  scheduleCloseOnHoverLeave: vi.fn(),
}));

vi.mock("@vueuse/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vueuse/core")>();
  const { ref } = await import("vue");

  return {
    ...actual,
    useElementBounding: () => ({
      top: ref(20),
      left: ref(10),
      width: ref(640),
      height: ref(400),
    }),
  };
});

vi.mock("vue-sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../../admin/features/Stage/composables/useStageMarkupPreview", async () => {
  const { ref } = await import("vue");

  stageMarkupPreviewState.isOpen ??= ref(false);
  stageMarkupPreviewState.markup ??= ref("<main>Preview</main>");
  stageMarkupPreviewState.stylesheet ??= ref(".preview {}");

  return {
    useStageMarkupPreview: () => ({
      isMarkupPreviewOpen: stageMarkupPreviewState.isOpen,
      markupPreview: stageMarkupPreviewState.markup,
      stylesheetPreview: stageMarkupPreviewState.stylesheet,
      setMarkupPreviewOpen: stageMarkupPreviewState.setOpen,
      keepMarkupPreviewOpenOnHover:
        stageMarkupPreviewState.keepOpenOnHover,
      scheduleMarkupPreviewCloseOnHoverLeave:
        stageMarkupPreviewState.scheduleCloseOnHoverLeave,
    }),
  };
});

import StageMarkupPreviewPanel from "../../../admin/features/Stage/components/StageMarkupPreviewPanel.vue";

describe("StageMarkupPreviewPanel", () => {
  const writeText = vi.fn<() => Promise<void>>();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    stageMarkupPreviewState.isOpen.value = false;
    stageMarkupPreviewState.markup.value = "<main>Preview</main>";
    stageMarkupPreviewState.stylesheet.value = ".preview {}";
    writeText.mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  it("only renders when the shared preview state is open", async () => {
    const wrapper = mount(StageMarkupPreviewPanel, {
      global: { stubs: { Teleport: true, Transition: true } },
    });

    expect(wrapper.find('[data-testid="stage-markup-preview-panel"]').exists()).toBe(
      false,
    );

    stageMarkupPreviewState.isOpen.value = true;
    await nextTick();

    expect(wrapper.find('[data-testid="stage-markup-preview-panel"]').exists()).toBe(
      true,
    );
    wrapper.unmount();
  });

  it("shows and clears copy confirmation feedback", async () => {
    stageMarkupPreviewState.isOpen.value = true;
    const wrapper = mount(StageMarkupPreviewPanel, {
      global: { stubs: { Teleport: true, Transition: true } },
    });

    const copyMarkup = wrapper.find('button[aria-label="Copy markup"]');
    await copyMarkup.trigger("click");
    await vi.runAllTicks();

    expect(writeText).toHaveBeenCalledWith("<main>Preview</main>");
    expect(wrapper.find('button[aria-label="Markup copied"]').exists()).toBe(true);

    vi.advanceTimersByTime(1_500);
    await nextTick();

    expect(wrapper.find('button[aria-label="Copy markup"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it("cancels pending copy feedback when unmounted", async () => {
    stageMarkupPreviewState.isOpen.value = true;
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const wrapper = mount(StageMarkupPreviewPanel, {
      global: { stubs: { Teleport: true, Transition: true } },
    });

    await wrapper.find('button[aria-label="Copy stylesheet"]').trigger("click");
    await vi.runAllTicks();
    wrapper.unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});
