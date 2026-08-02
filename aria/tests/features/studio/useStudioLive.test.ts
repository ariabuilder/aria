import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invalidateComponentClientCachesMock } = vi.hoisted(() => ({
  invalidateComponentClientCachesMock: vi.fn(),
}));

vi.mock("@/features/Core/composables/componentCacheCoherence", () => ({
  invalidateComponentClientCaches: invalidateComponentClientCachesMock,
}));

describe("Studio Live availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
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

  it("invalidates both component cache layers for realtime updates", async () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const { disconnectStudioLive, publishLocalStudioInvalidation } =
      await import("../../../admin/features/Studio/realtime/useStudioLive");

    publishLocalStudioInvalidation({
      eventId: "b76ea260-f3c3-48e0-8c52-df2cfdfab6c0",
      siteRevision: 42,
      resourceType: "component",
      resourceId: "header",
      scopes: ["content", "render"],
    });

    expect(invalidateComponentClientCachesMock).toHaveBeenCalledWith(
      "header",
      "realtime",
    );
    disconnectStudioLive();
  });
});
