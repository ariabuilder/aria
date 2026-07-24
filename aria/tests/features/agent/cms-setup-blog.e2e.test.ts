import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ariaSetupBlog } from "../../../admin/features/Agent/lib/tools/cms/cmsTools";
import {
  adminUser,
  createAgentContext,
  harnessAdapter,
  setupHarnessAdapter,
  teardownHarnessAdapter,
} from "./helpers/agentCmsHarness";

vi.mock("../../../lib/storage/getStorageAdapter", () => ({
  getStorageAdapterAsync: vi.fn(async () => {
    if (!harnessAdapter) {
      throw new Error("Agent CMS harness not initialized");
    }
    return harnessAdapter;
  }),
  clearStorageAdapterCache: vi.fn(),
}));

vi.mock("../../../lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/auth")>();
  return {
    ...actual,
    requireAuth: vi.fn(async () => adminUser),
    requireOperation: vi.fn(async () => adminUser),
  };
});

describe("aria_setup_blog playbook", () => {
  beforeEach(async () => {
    await setupHarnessAdapter();
  });

  afterEach(async () => {
    await teardownHarnessAdapter();
  });

  it("creates topics and posts collections through CMS actions", async () => {
    const suffix = Date.now().toString(36);
    const result = await ariaSetupBlog(createAgentContext(), {
      topicsName: `topics-${suffix}`,
      postsName: `posts-${suffix}`,
      seedSampleEntry: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.created).toEqual(
        expect.arrayContaining([`topics-${suffix}`, `posts-${suffix}`]),
      );
      if (result.data.entries.length > 0) {
        expect(result.data.entries[0]).toBeTruthy();
      }
    }
  });

  it("reuses existing collections on a second run", async () => {
    const suffix = Date.now().toString(36);
    const input = {
      topicsName: `topics-${suffix}`,
      postsName: `posts-${suffix}`,
      seedSampleEntry: true,
    };

    const first = await ariaSetupBlog(createAgentContext(), input);
    expect(first.ok).toBe(true);

    const second = await ariaSetupBlog(createAgentContext(), input);
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.data.created).toEqual([]);
      expect(second.data.reused).toEqual(
        expect.arrayContaining([input.topicsName, input.postsName]),
      );
    }
  });
});
