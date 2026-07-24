import { defineComponent, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import { COMPONENT_PREVIEW_ROOT_ATTR } from "@/lib/schemas/componentPreview";
import { useComponentPreviewFit } from "@/features/Studio/components/composables/useComponentPreviewFit";

function createPreviewDom(options: {
  wellWidth: number;
  wellHeight: number;
  contentHeight: number;
}) {
  const well = document.createElement("div");
  Object.defineProperty(well, "clientWidth", {
    configurable: true,
    get: () => options.wellWidth,
  });
  Object.defineProperty(well, "clientHeight", {
    configurable: true,
    get: () => options.wellHeight,
  });

  const doc = document.implementation.createHTMLDocument("preview");
  const previewRoot = doc.createElement("div");
  previewRoot.setAttribute(COMPONENT_PREVIEW_ROOT_ATTR, "");
  Object.defineProperty(previewRoot, "scrollHeight", {
    configurable: true,
    get: () => options.contentHeight,
  });
  Object.defineProperty(previewRoot, "offsetHeight", {
    configurable: true,
    get: () => options.contentHeight,
  });
  Object.defineProperty(previewRoot, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      height: options.contentHeight,
      width: 1440,
    }),
  });
  doc.body.appendChild(previewRoot);
  Object.defineProperty(doc.body, "scrollHeight", {
    configurable: true,
    get: () => options.contentHeight,
  });
  Object.defineProperty(doc.documentElement, "scrollHeight", {
    configurable: true,
    get: () => options.contentHeight,
  });

  const iframe = document.createElement("iframe");
  Object.defineProperty(iframe, "contentDocument", {
    configurable: true,
    get: () => doc,
  });

  return { well, iframe };
}

async function mountPreviewFit(options?: {
  wellWidth?: number;
  wellHeight?: number;
  contentHeight?: number;
  frameWidth?: number;
  enabled?: boolean;
}) {
  const wellWidth = options?.wellWidth ?? 200;
  const wellHeight = options?.wellHeight ?? 100;
  const contentHeight = options?.contentHeight ?? 400;
  const frameWidth = ref(options?.frameWidth ?? 1440);
  const enabled = ref(options?.enabled ?? true);

  const { well, iframe } = createPreviewDom({
    wellWidth,
    wellHeight,
    contentHeight,
  });

  const iframeRef = ref(iframe);
  const wellRef = ref(well);

  let fitApi: ReturnType<typeof useComponentPreviewFit> | null = null;

  const Host = defineComponent({
    setup() {
      fitApi = useComponentPreviewFit({
        iframeRef,
        wellRef,
        enabled,
        frameWidth,
      });
      return () => null;
    },
  });

  mount(Host);
  await nextTick();
  fitApi!.measureAndFit();

  return {
    fitApi: fitApi!,
    enabled,
  };
}

describe("useComponentPreviewFit", () => {
  it("scales the viewport frame to fit the preview well", async () => {
    const { fitApi } = await mountPreviewFit({
      wellWidth: 360,
      wellHeight: 225,
      contentHeight: 800,
      frameWidth: 1440,
    });

    expect(fitApi.fitScale.value).toBeCloseTo(0.25, 2);
    expect(fitApi.contentHeight.value).toBe(800);
    expect(fitApi.frameInnerStyle.value.width).toBe("1440px");
    expect(fitApi.frameInnerStyle.value.flex).toBe("0 0 auto");
  });

  it("caps scale at 1 when the frame already fits", async () => {
    const { fitApi } = await mountPreviewFit({
      wellWidth: 1600,
      wellHeight: 900,
      contentHeight: 400,
      frameWidth: 1440,
    });

    expect(fitApi.fitScale.value).toBe(1);
  });

  it("resets fit state when disabled", async () => {
    const { fitApi, enabled } = await mountPreviewFit();
    expect(fitApi.contentHeight.value).toBeGreaterThan(0);

    enabled.value = false;
    fitApi.measureAndFit();

    expect(fitApi.contentHeight.value).toBe(0);
    expect(fitApi.containerWidth.value).toBe(0);
  });
});
