import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";

import PageCoverImage from "../../../../admin/features/Studio/pages/components/PageCoverImage.vue";

const { toastErrorMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
}));

vi.mock("vue-sonner", () => ({
  toast: {
    error: toastErrorMock,
  },
}));

vi.mock("../../../../admin/composables/useStudioCapabilities", () => ({
  useStudioCapabilities: () => ({
    canChangeCover: { value: true },
    canRemoveCover: { value: true },
    getForbiddenMessage: () => "You do not have permission to do this.",
  }),
}));

const CoverImageCardStub = defineComponent({
  name: "CoverImageCard",
  props: {
    alt: { type: String, default: "" },
    caption: { type: String, default: "" },
    hasImage: { type: Boolean, default: false },
    imageUrl: { type: String, default: "" },
    disabled: { type: Boolean, default: false },
  },
  emits: ["update:alt", "update:caption", "choose", "remove"],
  setup(props, { emit }) {
    return () =>
      h("div", { "data-testid": "cover-image-card" }, [
        h("input", {
          "data-testid": "alt-input",
          value: props.alt,
          onInput: (event: Event) =>
            emit("update:alt", (event.target as HTMLInputElement).value),
        }),
        h("input", {
          "data-testid": "caption-input",
          value: props.caption,
          onInput: (event: Event) =>
            emit("update:caption", (event.target as HTMLInputElement).value),
        }),
        h(
          "button",
          { "data-testid": "choose-btn", onClick: () => emit("choose") },
          "choose",
        ),
        h(
          "button",
          { "data-testid": "remove-btn", onClick: () => emit("remove") },
          "remove",
        ),
      ]);
  },
});

const MediaPickerDialogStub = defineComponent({
  name: "MediaPickerDialog",
  props: {
    open: { type: Boolean, default: false },
  },
  emits: ["update:open", "select"],
  setup(props) {
    return () =>
      h("div", { "data-testid": "media-picker", "data-open": String(props.open) });
  },
});

function mountCover(props: Record<string, unknown> = {}) {
  return mount(PageCoverImage, {
    props: {
      coverSrc: "/media/hero.jpg",
      coverAlt: "Hero image",
      coverCaption: "A scenic hero shot",
      ...props,
    },
    global: {
      stubs: {
        CoverImageCard: CoverImageCardStub,
        MediaPickerDialog: MediaPickerDialogStub,
      },
    },
  });
}

describe("PageCoverImage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    toastErrorMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the current alt text and caption from props", () => {
    const wrapper = mountCover();
    expect(
      wrapper.find('[data-testid="alt-input"]').element as HTMLInputElement,
    ).toHaveProperty("value", "Hero image");
    expect(
      wrapper.find('[data-testid="caption-input"]').element as HTMLInputElement,
    ).toHaveProperty("value", "A scenic hero shot");
  });

  it("debounces alt/caption edits into one local draft update", async () => {
    const wrapper = mountCover();

    await wrapper.find('[data-testid="alt-input"]').setValue("New alt text");
    await vi.advanceTimersByTimeAsync(200);
    await wrapper.find('[data-testid="caption-input"]').setValue("New caption");

    // Still within the debounce window from the first edit — no commit yet.
    await vi.advanceTimersByTimeAsync(400);
    expect(wrapper.emitted("update")).toBeUndefined();

    await vi.advanceTimersByTimeAsync(600);
    await flushPromises();

    expect(wrapper.emitted("update")).toEqual([
      ["/media/hero.jpg", "New alt text", "New caption", false],
    ]);
  });

  it("does not commit when the debounced value matches the last saved value", async () => {
    const wrapper = mountCover();

    await wrapper.find('[data-testid="alt-input"]').setValue("Hero image ");
    await wrapper.find('[data-testid="alt-input"]').setValue("Hero image");
    await vi.advanceTimersByTimeAsync(600);
    await flushPromises();

    expect(wrapper.emitted("update")).toBeUndefined();
  });

  it("selecting a new cover image preserves the drafted caption", async () => {
    const wrapper = mountCover();

    await wrapper.find('[data-testid="caption-input"]').setValue("Keep me");
    // Selecting an image is immediate, but remains local to the page draft.
    expect(wrapper.emitted("update")).toBeUndefined();

    const picker = wrapper.findComponent(MediaPickerDialogStub);
    picker.vm.$emit("select", { url: "/media/new.jpg", name: "New Asset" });
    await flushPromises();

    expect(wrapper.emitted("update")).toEqual([
      ["/media/new.jpg", "New Asset", "Keep me", true],
    ]);
  });

  it("removes the cover image and emits remove", async () => {
    const wrapper = mountCover();

    await wrapper.find('[data-testid="remove-btn"]').trigger("click");
    await flushPromises();

    expect(wrapper.emitted("remove")).toEqual([[]]);
  });

  it("cancels a pending local draft update on unmount", async () => {
    const wrapper = mountCover();

    await wrapper.find('[data-testid="alt-input"]').setValue("Pending update");
    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(600);
    await flushPromises();

    expect(wrapper.emitted("update")).toBeUndefined();
  });
});
