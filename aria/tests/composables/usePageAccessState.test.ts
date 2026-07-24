import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPolicyMock, updatePolicyMock } = vi.hoisted(() => ({
  getPolicyMock: vi.fn(),
  updatePolicyMock: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: {
    pages: {
      getPolicy: (...args: unknown[]) => getPolicyMock(...args),
      updatePolicy: (...args: unknown[]) => updatePolicyMock(...args),
    },
  },
}));

const basePolicy = {
  id: "page-404",
  slug: "not-found-page",
  systemRole: "standard" as const,
  accessMode: "public" as const,
  hasPassword: false,
  policyVersion: 1,
};

describe("usePageAccessState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  async function loadComposable() {
    const { usePageAccessState } =
      await import("../../admin/features/Studio/pages/composables/usePageAccessState");
    return usePageAccessState();
  }

  it("persists not-found assignment when access mode is public", async () => {
    getPolicyMock.mockResolvedValue({ data: basePolicy, error: null });
    updatePolicyMock.mockResolvedValue({
      data: {
        ...basePolicy,
        systemRole: "not-found",
      },
      error: null,
    });

    const state = await loadComposable();
    await state.loadPolicy("not-found-page");

    expect(state.systemRole.value).toBe("standard");
    expect(state.isPolicyDirty.value).toBe(false);

    state.systemRole.value = "not-found";
    expect(state.isPolicyDirty.value).toBe(true);

    await state.savePolicy("not-found-page");

    expect(updatePolicyMock).toHaveBeenCalledWith({
      slug: "not-found-page",
      systemRole: "not-found",
      accessMode: "public",
      newPassword: undefined,
      promptTitle: undefined,
      promptDescription: undefined,
      rememberForDays: null,
    });
    expect(state.systemRole.value).toBe("not-found");
    expect(state.isPolicyDirty.value).toBe(false);
  });

  it("skips updatePolicy when public standard policy is unchanged", async () => {
    getPolicyMock.mockResolvedValue({ data: basePolicy, error: null });

    const state = await loadComposable();
    await state.loadPolicy("not-found-page");

    await state.savePolicy("not-found-page");

    expect(updatePolicyMock).not.toHaveBeenCalled();
    expect(state.isPolicyDirty.value).toBe(false);
  });

  it("shares a valid policy across detail remounts without another request", async () => {
    getPolicyMock.mockResolvedValue({ data: basePolicy, error: null });

    const { usePageAccessState } =
      await import("../../admin/features/Studio/pages/composables/usePageAccessState");
    const first = usePageAccessState();
    const second = usePageAccessState();

    await first.loadPolicy("not-found-page");
    await second.loadPolicy("not-found-page");

    expect(second.systemRole.value).toBe("standard");
    expect(getPolicyMock).toHaveBeenCalledTimes(1);
  });

  it("does not report policy dirty while a replacement policy is loading", async () => {
    getPolicyMock.mockResolvedValueOnce({
      data: {
        ...basePolicy,
        systemRole: "not-found",
      },
      error: null,
    });

    const state = await loadComposable();
    await state.loadPolicy("not-found-page");

    expect(state.systemRole.value).toBe("not-found");
    expect(state.isPolicyDirty.value).toBe(false);

    let resolvePolicy: (value: unknown) => void = () => undefined;
    getPolicyMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePolicy = resolve;
      }),
    );

    const loading = state.loadPolicy("home");

    expect(state.isLoading.value).toBe(true);
    expect(state.systemRole.value).toBe("standard");
    expect(state.isPolicyDirty.value).toBe(false);

    resolvePolicy({ data: basePolicy, error: null });
    await loading;

    expect(state.isLoading.value).toBe(false);
    expect(state.isPolicyDirty.value).toBe(false);
    expect(updatePolicyMock).not.toHaveBeenCalled();
  });

  it("throws when updatePolicy returns an error", async () => {
    getPolicyMock.mockResolvedValue({ data: basePolicy, error: null });
    updatePolicyMock.mockResolvedValue({
      data: null,
      error: { message: "Only one page may own the 404 role." },
    });

    const state = await loadComposable();
    await state.loadPolicy("not-found-page");
    state.systemRole.value = "not-found";

    await expect(state.savePolicy("not-found-page")).rejects.toThrow(
      "Only one page may own the 404 role.",
    );
  });
});
