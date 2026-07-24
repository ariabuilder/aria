import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import type { SessionUser } from "@/lib/auth/types";

const replace = vi.fn();
const routeState = vi.hoisted(() => ({
  path: "/pages/testing",
  hash: "",
  query: {} as Record<string, string | string[] | undefined>,
}));

const { ButtonStub } = vi.hoisted(() => {
  const { defineComponent, h } = require("vue") as typeof import("vue");

  const ButtonStub = defineComponent({
    inheritAttrs: false,
    emits: ["click"],
    setup(_, { emit, slots, attrs }) {
      return () =>
        h(
          "button",
          {
            ...attrs,
            onClick: () => emit("click"),
          },
          slots.default?.(),
        );
    },
  });

  return { ButtonStub };
});

vi.mock("vue-router", () => ({
  useRoute: () => routeState,
  useRouter: () => ({
    replace,
  }),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ButtonStub,
}));

const sessionUser: SessionUser = {
  id: "aaaaaaaa-bbbb-4ccc-8ddd-111111111111",
  username: "andy",
  email: "andy@example.com",
  role: "administrator",
  totpEnabled: false,
  preferences: {},
};

describe("sidebar user profile", () => {
  beforeEach(() => {
    replace.mockClear();
    routeState.path = "/pages/testing";
    routeState.hash = "";
    routeState.query = { composer: "" };
  });

  it("opens the users tab with selectedUserId and preserves composer in the URL", async () => {
    const { useSettingsDialog } = await import(
      "../../../../admin/features/Studio/settings/composables/useSettingsDialog"
    );
    const dialog = useSettingsDialog();
    dialog.close();
    await nextTick();

    dialog.open("users", sessionUser.id);

    expect(dialog.isOpen.value).toBe(true);
    expect(dialog.activeTab.value).toBe("users");
    expect(dialog.selectedUserId.value).toBe(sessionUser.id);
    expect(replace).toHaveBeenCalledWith({
      path: "/pages/testing",
      hash: "",
      query: { composer: null, settings: "users" },
    });
  });

  it("opens the signed-in user profile when Profile is clicked", async () => {
    const { useSettingsDialog } = await import(
      "../../../../admin/features/Studio/settings/composables/useSettingsDialog"
    );
    const dialog = useSettingsDialog();
    await dialog.close();
    await nextTick();
    replace.mockClear();

    const SidebarUserMenu = (
      await import(
        "../../../../admin/features/Studio/core/components/SidebarUserMenu.vue"
      )
    ).default;

    const wrapper = mount(SidebarUserMenu, {
      props: {
        user: sessionUser,
        isLoading: false,
      },
    });

    const profileButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Profile"));

    expect(wrapper.text()).not.toMatch(/Identity|Actions|═|-->/);
    expect(profileButton).toBeTruthy();
    await profileButton!.trigger("click");

    expect(dialog.isOpen.value).toBe(true);
    expect(dialog.activeTab.value).toBe("users");
    expect(dialog.selectedUserId.value).toBe(sessionUser.id);
    expect(replace).toHaveBeenCalledWith({
      path: "/pages/testing",
      hash: "",
      query: { composer: null, settings: "users" },
    });
    expect(wrapper.emitted("navigate")).toBeUndefined();
    wrapper.unmount();
  });
});
