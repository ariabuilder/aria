import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import { useAgentPanel } from "../../../../admin/features/Agent/client/composables/useAgentPanel";
import { useGlobalAgentShortcuts } from "../../../../admin/features/Agent/client/composables/useGlobalAgentShortcuts";
import { AGENT_OPEN_EVENT } from "../../../../admin/features/Agent/lib/constants";

const Host = defineComponent({
  setup() {
    useGlobalAgentShortcuts();
    return () => null;
  },
});

describe("useGlobalAgentShortcuts", () => {
  afterEach(() => {
    useAgentPanel().close();
  });

  it("can open the agent without focusing the composer", () => {
    const wrapper = mount(Host);
    const panel = useAgentPanel();

    window.dispatchEvent(
      new CustomEvent(AGENT_OPEN_EVENT, {
        detail: { focusComposer: false },
      }),
    );

    expect(panel.isOpen.value).toBe(true);
    expect(panel.shouldFocusComposer.value).toBe(false);

    wrapper.unmount();
  });

  it("keeps composer focus enabled for default open events", () => {
    const wrapper = mount(Host);
    const panel = useAgentPanel();

    window.dispatchEvent(new CustomEvent(AGENT_OPEN_EVENT));

    expect(panel.isOpen.value).toBe(true);
    expect(panel.shouldFocusComposer.value).toBe(true);

    wrapper.unmount();
  });
});
