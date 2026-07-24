import { describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";

const { ButtonStub, PassThroughSlotStub, BadgeStub } = vi.hoisted(() => {
  const { defineComponent, h } = require("vue") as typeof import("vue");

  const PassThroughSlotStub = defineComponent({
    setup(_, { slots }) {
      return () => slots.default?.({});
    },
  });

  const ButtonStub = defineComponent({
    inheritAttrs: false,
    props: {
      disabled: {
        type: Boolean,
        default: false,
      },
    },
    emits: ["click"],
    setup(props, { emit, slots, attrs }) {
      return () =>
        h(
          "button",
          {
            ...attrs,
            disabled: props.disabled,
            onClick: () => emit("click"),
          },
          slots.default?.(),
        );
    },
  });

  const BadgeStub = defineComponent({
    setup(_, { slots }) {
      return () => h("span", slots.default?.());
    },
  });

  return { ButtonStub, PassThroughSlotStub, BadgeStub };
});

vi.mock("@/components/ui/button", () => ({
  Button: ButtonStub,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: BadgeStub,
}));

vi.mock("@/components/ui/label", () => ({
  Label: PassThroughSlotStub,
}));

vi.mock("@/components/ui/select", () => ({
  Select: PassThroughSlotStub,
  SelectContent: PassThroughSlotStub,
  SelectItem: PassThroughSlotStub,
  SelectTrigger: PassThroughSlotStub,
  SelectValue: PassThroughSlotStub,
}));

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: PassThroughSlotStub,
}));

vi.mock("@/features/Studio/media/components/MediaPickerDialog.vue", () => ({
  default: PassThroughSlotStub,
}));

vi.mock("vue-sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("astro:actions", () => ({
  actions: {
    auth: {
      updateUser: vi.fn(),
      resetUserPassword: vi.fn(),
    },
  },
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({
    query: {},
    params: {},
  }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("../../../admin/features/Studio/settings/composables/useSettingsDialog", () => ({
  useSettingsDialog: () => ({
    isOpen: { value: false },
    activeTab: { value: "general" },
    selectedUserId: { value: null },
    sessionProfileDirty: { value: false },
    open: vi.fn(),
    close: vi.fn(async () => {}),
    toggle: vi.fn(),
    markSessionProfileDirty: vi.fn(),
    clearSessionProfileDirty: vi.fn(),
    registerFlushCallback: vi.fn(() => vi.fn()),
    flushPendingSaves: vi.fn(async () => {}),
    registerTabReset: vi.fn(() => vi.fn()),
    getTabResetHandler: vi.fn(() => null),
  }),
}));

const bootstrapUser = {
  id: "aaaaaaaa-bbbb-4ccc-8ddd-111111111111",
  username: "bootstrap_admin",
  email: "bootstrap@example.com",
  role: "administrator" as const,
  totpEnabled: false,
  lastLoginAt: null,
  createdAt: "2026-03-27T10:00:00.000Z",
  avatarUrl: null,
};

describe("auth settings views", () => {
  it("hides delete for the bootstrap administrator in user detail", async () => {
    const UserDetailView = (
      await import("../../../admin/features/Auth/components/settings/UserDetailView.vue")
    ).default;

    const wrapper = mount(UserDetailView, {
      props: {
        user: bootstrapUser,
        bootstrapUserId: bootstrapUser.id,
        canDelete: false,
      },
      global: {
        stubs: { Teleport: true },
      },
    });

    await flushPromises();

    expect(
      wrapper.findAll("button").some((button) => button.text().includes("Delete")),
    ).toBe(false);
    expect(
      wrapper.findAll("button").some((button) => button.text().trim() === "Edit"),
    ).toBe(false);

    wrapper.unmount();
  });

  it("hides permission editing controls for the bootstrap administrator", async () => {
    const UserDetailView = (
      await import("../../../admin/features/Auth/components/settings/UserDetailView.vue")
    ).default;

    const wrapper = mount(UserDetailView, {
      props: {
        user: bootstrapUser,
        bootstrapUserId: bootstrapUser.id,
        canDelete: false,
      },
      global: {
        stubs: { Teleport: true },
      },
    });

    await flushPromises();

    const permissionsTab = wrapper
      .findAll("button")
      .find((button) => button.text().trim() === "Permissions");
    expect(permissionsTab).toBeDefined();
    await permissionsTab!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Full access; permissions cannot be changed.");
    expect(
      wrapper.findAll("button").some((button) => button.text().trim() === "Edit"),
    ).toBe(false);

    wrapper.unmount();
  });
});
