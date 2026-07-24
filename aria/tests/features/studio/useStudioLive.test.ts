import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Studio Live availability", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("does not probe the Cloudflare live service in the local Node runtime", async () => {
    vi.stubEnv("PUBLIC_ARIA_RUNTIME", "node");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { connectStudioLive, disconnectStudioLive } =
      await import("../../../admin/features/Studio/realtime/useStudioLive");

    connectStudioLive();
    await Promise.resolve();

    expect(fetchMock).not.toHaveBeenCalled();
    disconnectStudioLive();
  });

  it("disables retries when the local runtime reports no live-service binding", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 503,
        headers: { "X-Aria-Studio-Live": "unavailable" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { connectStudioLive, disconnectStudioLive, useStudioLive } =
      await import("../../../admin/features/Studio/realtime/useStudioLive");

    connectStudioLive();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(60_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useStudioLive().reconnectAttempt.value).toBe(0);
    disconnectStudioLive();
  });
});
