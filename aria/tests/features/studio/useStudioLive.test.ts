import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  clearPagePolicyCacheMock,
  invalidateAllPageResourcesMock,
  invalidateComponentClientCachesMock,
  invalidatePageResourceByIdMock,
} = vi.hoisted(() => ({
  clearPagePolicyCacheMock: vi.fn(),
  invalidateAllPageResourcesMock: vi.fn(),
  invalidateComponentClientCachesMock: vi.fn(),
  invalidatePageResourceByIdMock: vi.fn(),
}));

vi.mock("@/features/Core/composables/componentCacheCoherence", () => ({
  invalidateComponentClientCaches: invalidateComponentClientCachesMock,
}));
vi.mock("@/features/Studio/pages/composables/usePageResourceBank", () => ({
  invalidateAllPageResources: invalidateAllPageResourcesMock,
  invalidatePageResourceById: invalidatePageResourceByIdMock,
}));
vi.mock("@/features/Studio/pages/composables/usePageAccessState", () => ({
  clearPagePolicyCache: clearPagePolicyCacheMock,
}));

describe("Studio Live availability", () => {
  function studioSyncResponse(): Response {
    return Response.json({
      checkpoint: null,
      sessions: [],
      serverTime: Date.now(),
    });
  }

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

  it("uses storage reconciliation without probing Cloudflare push in Node", async () => {
    vi.stubEnv("PUBLIC_ARIA_RUNTIME", "node");
    const fetchMock = vi.fn().mockImplementation(async () =>
      studioSyncResponse(),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { connectStudioLive, disconnectStudioLive } =
      await import("../../../admin/features/Studio/realtime/useStudioLive");

    connectStudioLive();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(
      fetchMock.mock.calls.every(([input]) =>
        String(input).startsWith("/admin/api/studio-sync"),
      ),
    ).toBe(true);
    disconnectStudioLive();
  });

  it("disables retries when the local runtime reports no live-service binding", async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) =>
      String(input).startsWith("/admin/api/studio-live")
        ? new Response(null, {
            status: 503,
            headers: { "X-Aria-Studio-Live": "unavailable" },
          })
        : studioSyncResponse(),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { connectStudioLive, disconnectStudioLive, useStudioLive } =
      await import("../../../admin/features/Studio/realtime/useStudioLive");

    connectStudioLive();
    await vi.waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([input]) =>
          String(input).startsWith("/admin/api/studio-live"),
        ),
      ).toHaveLength(1),
    );
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(60_000);

    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).startsWith("/admin/api/studio-live"),
      ),
    ).toHaveLength(1);
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).startsWith("/admin/api/studio-sync"),
      ).length,
    ).toBeGreaterThan(1);
    expect(useStudioLive().reconnectAttempt.value).toBe(0);
    disconnectStudioLive();
  });

  it("reconciles exact revisions and fails safe across missed checkpoints", async () => {
    vi.stubEnv("PUBLIC_ARIA_RUNTIME", "node");
    let revisionSeq = 10;
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const fetchMock = vi.fn().mockImplementation(async () =>
      Response.json({
        checkpoint: {
          revisionSeq,
          currentRevisionId: `revision-${revisionSeq}`,
          lastMutationKind: "save-page",
          lastMutationTarget: "home",
          updatedAt: new Date(revisionSeq).toISOString(),
        },
        sessions: [],
        serverTime: revisionSeq,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { connectStudioLive, disconnectStudioLive, useStudioLive } =
      await import("../../../admin/features/Studio/realtime/useStudioLive");
    connectStudioLive();
    await vi.waitFor(() =>
      expect(useStudioLive().lastSiteRevision.value).toBe(10),
    );

    revisionSeq = 11;
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.waitFor(() =>
      expect(invalidatePageResourceByIdMock).toHaveBeenCalledWith(
        "home",
        "realtime",
      ),
    );

    revisionSeq = 13;
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.waitFor(() =>
      expect(invalidateAllPageResourcesMock).toHaveBeenCalledWith(
        "realtime-reconcile",
      ),
    );

    revisionSeq = 12;
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.waitFor(() =>
      expect(warning).toHaveBeenCalledWith(
        "[Studio Sync] Stale revision checkpoint ignored",
        expect.objectContaining({ code: "STUDIO_REVISION_STALE" }),
      ),
    );
    expect(useStudioLive().lastSiteRevision.value).toBe(13);
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
