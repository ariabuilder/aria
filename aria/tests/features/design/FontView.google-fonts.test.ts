import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";

const { listGoogleMock, getConfigMock } = vi.hoisted(() => ({
  listGoogleMock: vi.fn(),
  getConfigMock: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: {
    fonts: {
      listGoogle: listGoogleMock,
      getConfig: getConfigMock,
      enableGoogle: vi.fn(),
      disableGoogle: vi.fn(),
      uploadCustom: vi.fn(),
      deleteCustom: vi.fn(),
    },
    designSystem: {
      getBreakpoints: vi.fn(async () => ({
        data: { success: true, data: { breakpoints: [] } },
        error: null,
      })),
    },
  },
}));

vi.mock("@/lib/utils/logger", () => ({
  log: vi.fn(),
}));

vi.mock("vue-sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("../../../admin/assets/brands/google.svg?raw", () => ({
  default: "<svg />",
}));

vi.mock("@/features/Studio/core/components/ExpandableSearchInput.vue", () => ({
  default: defineComponent({
    props: {
      modelValue: {
        type: String,
        default: "",
      },
    },
    emits: ["update:modelValue"],
    setup(props, { emit }) {
      return () =>
        h("input", {
          "data-testid": "font-search",
          value: props.modelValue,
          onInput: (event: Event) =>
            emit("update:modelValue", (event.target as HTMLInputElement).value),
        });
    },
  }),
}));

vi.mock("@/features/Studio/core/components/HeaderActionDropdownTooltip.vue", () => ({
  default: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
}));

vi.mock("../../../admin/features/Design/dialogs/DesignAssetImportDialog.vue", () => ({
  default: defineComponent({
    setup() {
      return () => h("div");
    },
  }),
}));

vi.mock("../../../admin/features/Design/components/DesignHeaderTeleport.vue", () => ({
  default: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
}));

vi.mock("@/components/ui/button", async () => {
  const { defineComponent, h } = await vi.importActual<typeof import("vue")>(
    "vue",
  );
  return {
    Button: defineComponent({
      emits: ["click"],
      setup(_, { emit, slots }) {
        return () =>
          h("button", { onClick: () => emit("click") }, slots.default?.());
      },
    }),
  };
});

vi.mock("@/components/ui/dialog", async () => {
  const { defineComponent, h } = await vi.importActual<typeof import("vue")>(
    "vue",
  );
  const Passthrough = defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  });
  return {
    Dialog: Passthrough,
    DialogContent: Passthrough,
    DialogDescription: Passthrough,
    DialogFooter: Passthrough,
    DialogHeader: Passthrough,
    DialogTitle: Passthrough,
  };
});

vi.mock("@/components/ui/input", () => ({
  Input: defineComponent({
    props: {
      modelValue: {
        type: String,
        default: "",
      },
    },
    emits: ["update:modelValue"],
    setup(props, { emit }) {
      return () =>
        h("input", {
          value: props.modelValue,
          onInput: (event: Event) =>
            emit("update:modelValue", (event.target as HTMLInputElement).value),
        });
    },
  }),
}));

vi.mock("@/components/ui/scroll-area", async () => {
  const { defineComponent, h } = await vi.importActual<typeof import("vue")>(
    "vue",
  );
  return {
    ScrollArea: defineComponent({
      setup(_, { slots }) {
        return () => h("div", slots.default?.());
      },
    }),
  };
});

vi.mock("@/components/ui/dropdown-menu", async () => {
  const { defineComponent, h } = await vi.importActual<typeof import("vue")>(
    "vue",
  );
  const Passthrough = defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  });
  return {
    DropdownMenu: Passthrough,
    DropdownMenuContent: Passthrough,
    DropdownMenuGroup: Passthrough,
    DropdownMenuItem: Passthrough,
    DropdownMenuTrigger: Passthrough,
  };
});

interface GoogleFont {
  family: string;
  variants: string[];
  subsets: string[];
  category: string;
}

function makeFonts(start: number, count: number, prefix = "Font"): GoogleFont[] {
  return Array.from({ length: count }, (_, index) => ({
    family: `${prefix} ${start + index}`,
    variants: ["400"],
    subsets: ["latin"],
    category: "sans-serif",
  }));
}

function fontListResponse(fonts: GoogleFont[], total = fonts.length) {
  return {
    data: {
      success: true,
      fonts,
      total,
      offset: 0,
      limit: 32,
      hasMore: fonts.length < total,
    },
    error: null,
  };
}

function fontConfigResponse() {
  return {
    data: {
      success: true,
      data: {
        customFonts: [],
        enabledGoogleFonts: [],
      },
    },
    error: null,
  };
}

let intersectionCallback:
  | ((entries: Array<{ isIntersecting: boolean }>) => void)
  | null = null;
let appendHeadSpy: ReturnType<typeof vi.spyOn> | null = null;

function mountFontView() {
  return mount(FontView, {
    attachTo: document.body,
  });
}

import FontView from "../../../admin/features/Design/views/FontView.vue";

describe("FontView Google Fonts loading", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    listGoogleMock.mockReset();
    getConfigMock.mockReset();
    getConfigMock.mockResolvedValue(fontConfigResponse());
    intersectionCallback = null;

    document.head.innerHTML = "";
    document.body.innerHTML = "";
    appendHeadSpy = vi
      .spyOn(document.head, "appendChild")
      .mockImplementation((node) => node);

    vi.stubGlobal("requestIdleCallback", (callback: () => void) => {
      callback();
      return 1;
    });
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: typeof intersectionCallback) {
          intersectionCallback = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    appendHeadSpy?.mockRestore();
    appendHeadSpy = null;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("loads only the first Google Fonts page on mount", async () => {
    listGoogleMock.mockResolvedValue(fontListResponse(makeFonts(0, 32), 64));

    const wrapper = mountFontView();
    await flushPromises();

    expect(listGoogleMock).toHaveBeenCalledWith({
      search: undefined,
      category: "all",
      limit: 32,
      offset: 0,
    });
    expect(wrapper.text()).toContain("32 of 64 fonts");

    wrapper.unmount();
  });

  it("loads the next page from the sentinel", async () => {
    listGoogleMock
      .mockResolvedValueOnce(fontListResponse(makeFonts(0, 32), 64))
      .mockResolvedValueOnce(fontListResponse(makeFonts(32, 32), 64));

    const wrapper = mountFontView();
    await flushPromises();

    intersectionCallback?.([{ isIntersecting: true }]);
    await flushPromises();

    expect(listGoogleMock).toHaveBeenLastCalledWith({
      search: undefined,
      category: "all",
      limit: 32,
      offset: 32,
    });
    expect(wrapper.text()).toContain("64 of 64 fonts");

    wrapper.unmount();
  });

  it("keeps loading while the sentinel remains visible", async () => {
    listGoogleMock
      .mockResolvedValueOnce(fontListResponse(makeFonts(0, 32), 96))
      .mockResolvedValueOnce(fontListResponse(makeFonts(32, 32), 96))
      .mockResolvedValueOnce(fontListResponse(makeFonts(64, 32), 96));

    const wrapper = mountFontView();
    await flushPromises();

    intersectionCallback?.([{ isIntersecting: true }]);
    await flushPromises();
    await flushPromises();

    expect(listGoogleMock).toHaveBeenNthCalledWith(2, {
      search: undefined,
      category: "all",
      limit: 32,
      offset: 32,
    });
    expect(listGoogleMock).toHaveBeenNthCalledWith(3, {
      search: undefined,
      category: "all",
      limit: 32,
      offset: 64,
    });
    expect(wrapper.text()).toContain("96 of 96 fonts");

    wrapper.unmount();
  });

  it("ignores stale search responses", async () => {
    listGoogleMock.mockResolvedValueOnce(fontListResponse(makeFonts(0, 32), 64));

    let resolveSlow:
      | ((value: ReturnType<typeof fontListResponse>) => void)
      | undefined;
    const slowResponse = new Promise<ReturnType<typeof fontListResponse>>(
      (resolve) => {
        resolveSlow = resolve;
      },
    );
    listGoogleMock
      .mockReturnValueOnce(slowResponse)
      .mockResolvedValueOnce(fontListResponse(makeFonts(0, 1, "Fast"), 1));

    const wrapper = mountFontView();
    await flushPromises();

    const searchInput = wrapper.get('[data-testid="font-search"]');
    await searchInput.setValue("slow");
    await vi.advanceTimersByTimeAsync(250);
    await searchInput.setValue("fast");
    await vi.advanceTimersByTimeAsync(250);
    await flushPromises();

    resolveSlow?.(fontListResponse(makeFonts(0, 1, "Slow"), 1));
    await flushPromises();

    expect(wrapper.text()).toContain("Fast 0");
    expect(wrapper.text()).not.toContain("Slow 0");

    wrapper.unmount();
  });
});
