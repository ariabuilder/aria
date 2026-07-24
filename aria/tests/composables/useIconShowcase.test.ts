import { flushPromises } from "@vue/test-utils";
import { nextTick, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n", () => ({
  useStudioI18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/iconDataClient", () => ({
  resolveIconSvgData: vi.fn(async () => ({})),
}));

import { useIconShowcase } from "../../admin/features/Design/composables/useIconShowcase";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function response(pack: string) {
  return {
    ok: true,
    json: async () => ({
      items: [
        {
          id: `${pack}:sample`,
          pack,
          name: "sample",
          label: "Sample",
          tags: [],
        },
      ],
      nextCursor: null,
      snapshotVersion: "test",
    }),
  };
}

describe("useIconShowcase", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("ignores a late response from a previously selected pack", async () => {
    const first = deferred<ReturnType<typeof response>>();
    const second = deferred<ReturnType<typeof response>>();
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    vi.stubGlobal("fetch", fetchMock);

    const pack = ref<"lucide" | "coreui-brands" | "">("lucide");
    const showcase = useIconShowcase(pack);
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    pack.value = "coreui-brands";
    await nextTick();
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    second.resolve(response("coreui-brands"));
    await flushPromises();
    expect(showcase.items.value[0]?.pack).toBe("coreui-brands");

    first.resolve(response("lucide"));
    await flushPromises();
    expect(showcase.items.value[0]?.pack).toBe("coreui-brands");
  });
});
