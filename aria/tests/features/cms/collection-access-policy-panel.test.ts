import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CollectionAccessPolicyPanel from "../../../admin/features/CMS/components/CollectionAccessPolicyPanel.vue";

const mocks = vi.hoisted(() => ({
  getPolicy: vi.fn(),
  listPolicyPrincipals: vi.fn(),
  setPolicy: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: {
    cms: {
      collections: {
        getPolicy: mocks.getPolicy,
        listPolicyPrincipals: mocks.listPolicyPrincipals,
        setPolicy: mocks.setPolicy,
      },
    },
  },
}));

vi.mock("@/features/Auth/composables/useUser", () => ({
  useUser: () => ({
    user: {
      value: {
        id: "admin-1",
        username: "admin",
        role: "administrator",
      },
    },
    fetchUser: vi.fn(async () => {}),
  }),
}));

vi.mock("vue-sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const collection = {
  id: "collection-blog",
  supports: ["body"],
  schema: { fields: [] },
};

describe("CollectionAccessPolicyPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPolicy.mockResolvedValue({
      data: {
        policy: {
          collectionId: collection.id,
          mode: "inherit",
          rules: [],
          updatedAt: "2026-07-13T00:00:00.000Z",
        },
      },
    });
    mocks.listPolicyPrincipals.mockResolvedValue({
      data: { users: [] },
    });
    mocks.setPolicy.mockImplementation(async (input) => ({
      data: {
        policy: {
          collectionId: collection.id,
          mode: input.mode,
          rules: input.rules,
          updatedAt: "2026-07-13T00:00:01.000Z",
        },
      },
    }));
  });

  it("shows Save only while access restrictions are enabled", async () => {
    const wrapper = mount(CollectionAccessPolicyPanel, {
      props: { collection: collection as never },
      global: {
        stubs: {
          Button: {
            props: ["disabled"],
            template: '<button :disabled="disabled"><slot /></button>',
          },
          Checkbox: true,
          Input: true,
          Label: true,
          Select: true,
          SelectContent: true,
          SelectItem: true,
          SelectTrigger: true,
          SelectValue: true,
          Switch: {
            props: ["modelValue", "disabled"],
            emits: ["update:modelValue"],
            template:
              '<button data-test="policy-switch" :disabled="disabled" @click="$emit(\'update:modelValue\', !modelValue)">Toggle</button>',
          },
        },
      },
    });
    await flushPromises();

    expect(wrapper.text()).not.toContain("Save access policy");

    await wrapper.get('[data-test="policy-switch"]').trigger("click");
    expect(wrapper.text()).toContain("Save access policy");

    await wrapper.get('[data-test="policy-switch"]').trigger("click");
    await flushPromises();

    expect(mocks.setPolicy).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "inherit" }),
    );
    expect(wrapper.text()).not.toContain("Save access policy");
  });
});
