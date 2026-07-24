import { describe, expect, it, vi } from "vitest";

import { requestStageUnoExtractDebounced } from "../../admin/features/Stage/utils/requestStageUnoExtract";

describe("requestStageUnoExtractDebounced", () => {
  it("coalesces rapid extraction requests for the same window", async () => {
    vi.useFakeTimers();

    const extractAll = vi.fn(async () => {});
    const win = {
      __unocss_runtime: {
        uno: { extractAll },
      },
      setTimeout: window.setTimeout.bind(window),
      clearTimeout: window.clearTimeout.bind(window),
    } as unknown as Window;

    const first = requestStageUnoExtractDebounced(win, 80);
    const second = requestStageUnoExtractDebounced(win, 80);

    await vi.advanceTimersByTimeAsync(79);
    expect(extractAll).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await Promise.all([first, second]);

    expect(extractAll).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
