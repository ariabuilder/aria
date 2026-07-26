import { describe, expect, it, vi } from "vitest";

import { D1_SAFE_INLINE_STATEMENT_BYTES } from "../../lib/storage/push-validation";
import { createRemoteD1Database } from "../../lib/storage/remote-d1";
import { runWrangler } from "../../scripts/lib/wrangler-command";

vi.mock("../../scripts/lib/wrangler-command", () => ({
  runWrangler: vi.fn(),
}));

describe("Wrangler-backed D1 statements", () => {
  it("rejects oversized UTF-8 SQL before invoking Wrangler", async () => {
    const database = await createRemoteD1Database("aria_db", {
      remote: false,
    });
    const oversizedSql = "é".repeat(
      Math.floor(D1_SAFE_INLINE_STATEMENT_BYTES / 2) + 1,
    );

    await expect(database.prepare(oversizedSql).run()).rejects.toThrow(
      "SQL statement exceeds D1 safe inline limit",
    );
    expect(runWrangler).not.toHaveBeenCalled();
  });

  it("executes inline SQL as a command so Wrangler returns query results", async () => {
    vi.mocked(runWrangler).mockResolvedValue({
      status: 0,
      signal: null,
      stdout: JSON.stringify([
        {
          results: [{ value: 1 }],
          success: true,
        },
      ]),
      stderr: "",
    });
    const database = await createRemoteD1Database("aria_db", {
      remote: false,
    });

    await expect(
      database.prepare("SELECT ? AS value").bind(1).all(),
    ).resolves.toEqual({
      results: [{ value: 1 }],
    });

    expect(runWrangler).toHaveBeenCalledOnce();
    const [args] = vi.mocked(runWrangler).mock.calls[0]!;
    expect(args).toContain("--command");
    expect(args).not.toContain("--file");
    expect(args[args.indexOf("--command") + 1]).toBe("SELECT 1 AS value");
  });
});
