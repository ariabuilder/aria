import { describe, expect, it, vi } from "vitest";

import { deferWithWaitUntil } from "../../../lib/cloudflare/waitUntil";

describe("deferWithWaitUntil", () => {
  it("returns false when the runtime rejects registration", () => {
    const task = Promise.resolve();
    const waitUntil = vi.fn(() => {
      throw new Error("response boundary closed");
    });

    expect(
      deferWithWaitUntil({ cfContext: { waitUntil } } as never, task),
    ).toBe(false);
    expect(waitUntil).toHaveBeenCalledWith(task);
  });
});
