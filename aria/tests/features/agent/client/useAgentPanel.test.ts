import { afterEach, describe, expect, it } from "vitest";
import { useAgentPanel } from "@/features/Agent/client/composables/useAgentPanel";

describe("useAgentPanel", () => {
  afterEach(() => {
    useAgentPanel().close();
  });

  it("increments openRequestId on every open call", () => {
    const panel = useAgentPanel();

    expect(panel.openRequestId.value).toBe(0);

    panel.open({ seed: "first prompt" });
    expect(panel.openRequestId.value).toBe(1);
    expect(panel.isOpen.value).toBe(true);

    panel.open({ seed: "second prompt" });
    expect(panel.openRequestId.value).toBe(2);
    expect(panel.isOpen.value).toBe(true);
  });

  it("stores the latest seed when reopening while already open", () => {
    const panel = useAgentPanel();

    panel.open({ seed: "first prompt" });
    panel.open({ seed: "updated prompt" });

    expect(panel.consumeSeedPrompt()).toBe("updated prompt");
  });

  it("carries a requested composer mode for one auto-send", () => {
    const panel = useAgentPanel();

    panel.open({ seed: "translate", autoSend: true, composerMode: "agent" });

    expect(panel.consumeRequestedComposerMode()).toBe("agent");
    expect(panel.consumeRequestedComposerMode()).toBeNull();
  });
});
