import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";

import PageCoverImage from "../../../../admin/features/Studio/pages/components/PageCoverImage.vue";

const { coverMock, removeCoverMock, toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  coverMock: vi.fn(),
  removeCoverMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: {
    pages: {
      cover: coverMock,
      removeCover: removeCoverMock,
    },
  },
}));

vi.mock("vue-sonner", () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
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
      pageSlug: "about",
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
    coverMock.mockReset();
    removeCoverMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
    coverMock.mockResolvedValue({
      data: { success: true, featuredImage: { src: "/media/hero.jpg" } },
    });
    removeCoverMock.mockResolvedValue({ data: { success: true } });
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

  it("debounces alt/caption edits and commits both via pages.cover", async () => {
    const wrapper = mountCover();

    await wrapper.find('[data-testid="alt-input"]').setValue("New alt text");
    await vi.advanceTimersByTimeAsync(200);
    await wrapper.find('[data-testid="caption-input"]').setValue("New caption");

    // Still within the debounce window from the first edit — no commit yet.
    await vi.advanceTimersByTimeAsync(400);
    expect(coverMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(600);
    await flushPromises();

    expect(coverMock).toHaveBeenCalledTimes(1);
    expect(coverMock).toHaveBeenCalledWith({
      pageSlug: "about",
      src: "/media/hero.jpg",
      alt: "New alt text",
      caption: "New caption",
      autoSetOgImage: false,
    });
    expect(wrapper.emitted("update")).toEqual([
      ["/media/hero.jpg", "New alt text", "New caption"],
    ]);
  });

  it("does not commit when the debounced value matches the last saved value", async () => {
    const wrapper = mountCover();

    await wrapper.find('[data-testid="alt-input"]').setValue("Hero image ");
    await wrapper.find('[data-testid="alt-input"]').setValue("Hero image");
    await vi.advanceTimersByTimeAsync(600);
    await flushPromises();

    expect(coverMock).not.toHaveBeenCalled();
  });

  it("selecting a new cover image preserves the drafted caption", async () => {
    const wrapper = mountCover();

    await wrapper.find('[data-testid="caption-input"]').setValue("Keep me");
    // Selecting an image is not debounced — it should not have committed yet.
    expect(coverMock).not.toHaveBeenCalled();

    const picker = wrapper.findComponent(MediaPickerDialogStub);
    picker.vm.$emit("select", { url: "/media/new.jpg", name: "New Asset" });
    await flushPromises();

    expect(coverMock).toHaveBeenCalledWith({
      pageSlug: "about",
      src: "/media/new.jpg",
      alt: "New Asset",
      caption: "Keep me",
      autoSetOgImage: true,
    });
    expect(wrapper.emitted("update")).toEqual([
      ["/media/new.jpg", "New Asset", "Keep me"],
    ]);
  });

  it("removes the cover image and emits remove", async () => {
    const wrapper = mountCover();

    await wrapper.find('[data-testid="remove-btn"]').trigger("click");
    await flushPromises();

    expect(removeCoverMock).toHaveBeenCalledWith({
      pageSlug: "about",
      clearOgImage: true,
    });
    expect(wrapper.emitted("remove")).toHaveLength(1);
    expect(toastSuccessMock).toHaveBeenCalled();
  });

  it("surfaces a toast error when the commit fails", async () => {
    coverMock.mockResolvedValueOnce({
      error: { code: "INTERNAL_SERVER_ERROR", message: "Nope" },
    });
    const wrapper = mountCover();

    await wrapper.find('[data-testid="alt-input"]').setValue("Broken update");
    await vi.advanceTimersByTimeAsync(600);
    await flushPromises();

    expect(toastErrorMock).toHaveBeenCalledWith("Nope");
    expect(wrapper.emitted("update")).toBeUndefined();
  });
});
