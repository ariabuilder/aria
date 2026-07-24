import { describe, expect, it, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";

const { PassThroughSlotStub, UserDetailStub, selectedUserId } = vi.hoisted(() => {
  const { defineComponent, ref } = require("vue") as typeof import("vue");

  const PassThroughSlotStub = defineComponent({
    setup(_, { slots }) {
      return () => slots.default?.({});
    },
  });

  const UserDetailStub = defineComponent({
    props: {
      user: {
        type: Object,
        required: true,
      },
    },
    template: '<div data-testid="user-detail">{{ user.username }}</div>',
  });

  const selectedUserId = ref<string | null>(
    "aaaaaaaa-bbbb-4ccc-8ddd-111111111111",
  );

  return { PassThroughSlotStub, UserDetailStub, selectedUserId };
});

vi.mock("astro:actions", () => ({
  actions: {
    auth: {
      listUsers: vi.fn(async () => ({
        data: {
          users: [
            {
              id: "aaaaaaaa-bbbb-4ccc-8ddd-111111111111",
              username: "andy",
              email: "andy@example.com",
              role: "administrator",
              totpEnabled: false,
              lastLoginAt: null,
              createdAt: "2026-03-27T10:00:00.000Z",
              avatarUrl: null,
            },
          ],
          bootstrapUserId: "aaaaaaaa-bbbb-4ccc-8ddd-111111111111",
        },
        error: undefined,
      })),
    },
  },
}));

vi.mock(
  "../../../admin/features/Studio/settings/composables/useSettingsDialog",
  () => ({
    useSettingsDialog: () => ({
      selectedUserId,
      markSessionProfileDirty: vi.fn(),
      setHeaderOverride: vi.fn(),
    }),
  }),
);

vi.mock(
  "../../../admin/features/Auth/components/settings/UserDetailView.vue",
  () => ({
    default: UserDetailStub,
  }),
);

vi.mock(
  "../../../admin/features/Auth/components/settings/dialogs/UsersCreateDialog.vue",
  () => ({
    default: PassThroughSlotStub,
  }),
);

vi.mock(
  "../../../admin/features/Auth/components/settings/dialogs/UsersDeleteDialog.vue",
  () => ({
    default: PassThroughSlotStub,
  }),
);

vi.mock("@/components/ui/button", () => ({
  Button: PassThroughSlotStub,
}));

vi.mock("@/components/ui/table", () => ({
  Table: PassThroughSlotStub,
  TableBody: PassThroughSlotStub,
  TableCell: PassThroughSlotStub,
  TableHead: PassThroughSlotStub,
  TableHeader: PassThroughSlotStub,
  TableRow: PassThroughSlotStub,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: PassThroughSlotStub,
  DropdownMenuContent: PassThroughSlotStub,
  DropdownMenuItem: PassThroughSlotStub,
  DropdownMenuSeparator: PassThroughSlotStub,
  DropdownMenuTrigger: PassThroughSlotStub,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: PassThroughSlotStub,
}));

describe("UsersView profile deep-link", () => {
  beforeEach(() => {
    selectedUserId.value = "aaaaaaaa-bbbb-4ccc-8ddd-111111111111";
  });

  it("resolves selectedUserId to UserDetailView after users load", async () => {
    const UsersView = (
      await import(
        "../../../admin/features/Auth/components/settings/UsersView.vue"
      )
    ).default;

    document.body.innerHTML = '<div id="settings-tab-actions"></div>';

    const wrapper = mount(UsersView);
    await flushPromises();

    expect(wrapper.find('[data-testid="user-detail"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="user-detail"]').text()).toBe("andy");
    expect(selectedUserId.value).toBeNull();

    wrapper.unmount();
    document.body.innerHTML = "";
  });
});
