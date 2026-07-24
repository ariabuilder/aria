import { computed, defineComponent, h, nextTick, ref, watchEffect } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";

import {
  useAppProvides,
  useInjectedPageBlocks,
  useInjectedPrefetchPageData,
  useInjectedPrewarmBuilder,
  useInjectedStageIframeRef,
} from "../../admin/features/Core";

describe("useAppInjectedRuntime", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("throws when pageBlocks is missing", () => {
    const Consumer = defineComponent({
      setup() {
        useInjectedPageBlocks();
      },
      render() {
        return h("div");
      },
    });

    expect(() => mount(Consumer)).toThrow(
      "Missing required app runtime injection: pageBlocks.",
    );
  });

  it("throws when prefetchPageData is missing", () => {
    const Consumer = defineComponent({
      setup() {
        useInjectedPrefetchPageData();
      },
      render() {
        return h("div");
      },
    });

    expect(() => mount(Consumer)).toThrow(
      "Missing required app runtime injection: prefetchPageData.",
    );
  });

  it("throws when prewarmBuilder is missing", () => {
    const Consumer = defineComponent({
      setup() {
        useInjectedPrewarmBuilder();
      },
      render() {
        return h("div");
      },
    });

    expect(() => mount(Consumer)).toThrow(
      "Missing required app runtime injection: prewarmBuilder.",
    );
  });

  it("throws when stageIframeRef is missing", () => {
    const Consumer = defineComponent({
      setup() {
        useInjectedStageIframeRef();
      },
      render() {
        return h("div");
      },
    });

    expect(() => mount(Consumer)).toThrow(
      "Missing required app runtime injection: stageIframeRef.",
    );
  });

  it("distinguishes missing stage provider from a provided but not-ready iframe", async () => {
    const iframeRef = ref<HTMLIFrameElement | null>(null);
    const observedIframeValue = ref<HTMLIFrameElement | null>(null);

    const Consumer = defineComponent({
      setup() {
        const injectedStageIframeRef = useInjectedStageIframeRef();

        watchEffect(() => {
          observedIframeValue.value = injectedStageIframeRef.value;
        });

        return () =>
          h("div", injectedStageIframeRef.value ? "ready" : "pending");
      },
    });

    const Provider = defineComponent({
      setup() {
        useAppProvides({
          pageBlocks: ref([]),
          currentLayout: ref(null),
          stageIframeRef: computed(() => iframeRef.value),
          prefetchPageData: async () => undefined,
          prewarmBuilder: async () => undefined,
        });

        return () => h(Consumer);
      },
    });

    const wrapper = mount(Provider);

    expect(wrapper.text()).toBe("pending");
    expect(observedIframeValue.value).toBeNull();

    const iframe = document.createElement("iframe");
    iframeRef.value = iframe;
    await nextTick();

    expect(wrapper.text()).toBe("ready");
    expect(observedIframeValue.value).toBe(iframe);

    wrapper.unmount();
  });

  it("can consume provided runtime values through the shared provider boundary", async () => {
    const pageBlocks = ref([
      {
        id: "node-1",
        type: "text",
        props: {},
        styles: {},
        children: [],
      },
    ]);
    const prefetchPageData = async (_slug: string): Promise<void> => undefined;
    const prewarmBuilder = async (): Promise<void> => undefined;

    const Consumer = defineComponent({
      setup() {
        const injectedPageBlocks = useInjectedPageBlocks();
        const injectedPrefetchPageData = useInjectedPrefetchPageData();
        const injectedPrewarmBuilder = useInjectedPrewarmBuilder();

        return () =>
          h(
            "div",
            `${injectedPageBlocks.value.length}:${String(injectedPrefetchPageData === prefetchPageData)}:${String(injectedPrewarmBuilder === prewarmBuilder)}`,
          );
      },
    });

    const Provider = defineComponent({
      setup() {
        useAppProvides({
          pageBlocks,
          currentLayout: ref(null),
          stageIframeRef: computed(() => null),
          prefetchPageData,
          prewarmBuilder,
        });

        return () => h(Consumer);
      },
    });

    const wrapper = mount(Provider);

    expect(wrapper.text()).toBe("1:true:true");

    wrapper.unmount();
  });
});
