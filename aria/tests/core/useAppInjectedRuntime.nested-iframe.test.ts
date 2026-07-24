import { computed, defineComponent, h, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import { useAppProvides, useInjectedStageIframeRef } from "../../admin/features/Core";

describe("useInjectedStageIframeRef nested expose", () => {
  it("unwraps nested computed iframe refs from the stage runtime chain", async () => {
    const iframe = document.createElement("iframe");
    const nestedExpose = computed(() => iframe);
    const stageExpose = computed(() => nestedExpose);
    const observed = ref<HTMLIFrameElement | null>(null);

    const Consumer = defineComponent({
      setup() {
        const injected = useInjectedStageIframeRef();
        observed.value = injected.value;
        return () => h("div", injected.value ? "ready" : "pending");
      },
    });

    const Provider = defineComponent({
      setup() {
        useAppProvides({
          pageBlocks: ref([]),
          currentLayout: ref(null),
          stageIframeRef: computed(() => stageExpose.value) as never,
          prefetchPageData: async () => undefined,
          prewarmBuilder: async () => undefined,
        });

        return () => h(Consumer);
      },
    });

    const wrapper = mount(Provider);
    await nextTick();

    expect(wrapper.text()).toBe("ready");
    expect(observed.value).toBe(iframe);

    wrapper.unmount();
  });
});
