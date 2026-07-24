import { mount, flushPromises } from "@vue/test-utils";
import { nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  composeMock,
  getBreakpointsMock,
  getRenderStylesMock,
  getSettingsMock,
} = vi.hoisted(() => ({
  composeMock: vi.fn(),
  getBreakpointsMock: vi.fn(),
  getRenderStylesMock: vi.fn(),
  getSettingsMock: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: {
    compose: composeMock,
    designSystem: {
      getBreakpoints: getBreakpointsMock,
    },
    settings: {
      get: getSettingsMock,
    },
    styles: {
      getRenderStyles: getRenderStylesMock,
    },
  },
}));

import ComponentIsolatePreview from "../../../admin/features/Studio/components/components/ComponentIsolatePreview.vue";

async function flushPreviewLoad(): Promise<void> {
  await flushPromises();
  await nextTick();
  await flushPromises();
  await nextTick();
}

describe("ComponentIsolatePreview", () => {
  beforeEach(() => {
    composeMock.mockResolvedValue({
      data: {
        pageBlocks: [
          {
            id: "node-1",
            type: "heading",
            props: {
              text: "Choose a Bundle",
            },
            styles: {},
            children: [],
          },
        ],
        pageMetadata: {
          settings: {
            cssVariables: {},
          },
        },
      },
      error: null,
    });

    getBreakpointsMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          breakpoints: [],
        },
      },
      error: null,
    });

    getSettingsMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          utilityEngine: "custom",
          breakpoints: [],
        },
      },
      error: null,
    });

    getRenderStylesMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          baseCSS: "",
          baseCSSHash: "base-hash",
          customClassesCSS: "",
          customFontsCSS: "",
          globalCSS: "",
          globalCSSHash: "global-hash",
          lastCompiled: "2026-07-03T00:00:00.000Z",
          styleRevision: "style-1",
          utilityCSS: "",
          utilityCSSHash: "utility-hash",
          utilityEngine: "custom",
        },
      },
      error: null,
    });
  });

  it("applies fit styles to the live iframe preview frame", async () => {
    const wrapper = mount(ComponentIsolatePreview, {
      props: {
        componentId: "andy",
        eager: true,
      },
    });

    await flushPreviewLoad();

    const iframe = wrapper.find("iframe");
    expect(iframe.exists()).toBe(true);

    const innerFrame = iframe.element.parentElement;
    const frameWrapper = innerFrame?.parentElement;

    expect(innerFrame?.getAttribute("style")).toContain("width: 1440px");
    expect(innerFrame?.getAttribute("style")).toContain("transform: scale(1)");
    expect(frameWrapper?.getAttribute("style")).toContain("display: flex");
    expect(iframe.attributes("style")).toContain("width: 100%");
    expect(iframe.attributes("style")).toContain("display: block");
  });
});
