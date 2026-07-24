import { describe, expect, it, vi } from "vitest";

import { useInspectorLiveStyleSession } from "../../../admin/features/Inspector/composables/useInspectorLiveStyleSession";

describe("useInspectorLiveStyleSession", () => {
  it("queues preview updates and tracks pending state", () => {
    const applyPreview = vi.fn();
    const captureOrigin = vi.fn(() => ({ color: "#000000" }));

    const session = useInspectorLiveStyleSession<{ color?: string }>({
      applyPreview,
      captureOrigin,
    });

    expect(session.hasPendingPreview.value).toBe(false);

    session.queuePreview({ color: "#ff0000" });
    session.flushPreview();

    expect(session.hasPendingPreview.value).toBe(true);
    expect(captureOrigin).toHaveBeenCalledTimes(1);
    expect(applyPreview).toHaveBeenCalledWith({ color: "#ff0000" });
  });

  it("restores captured origin on cancel", () => {
    const applyPreview = vi.fn();

    const session = useInspectorLiveStyleSession<{ color?: string }>({
      applyPreview,
      captureOrigin: () => ({ color: "#111111" }),
    });

    session.queuePreview({ color: "#222222" });
    session.cancelPreview();

    expect(session.hasPendingPreview.value).toBe(false);
    expect(applyPreview).toHaveBeenLastCalledWith({ color: "#111111" });
  });
});
