import { flushPromises, mount } from "@vue/test-utils";
import { actions } from "astro:actions";
import { defineComponent, h } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EmailConnectionCreateSchema,
  type EmailConnection,
} from "../../../lib/email/types";

const toastErrorMock = vi.fn();
const toastSuccessMock = vi.fn();
const authMock = vi.hoisted(() => ({
  user: {
    value: {
      id: "de008119-35c5-42a3-ad66-6e6b620838dc",
      username: "admin",
      email: "admin@example.com",
      role: "administrator",
      totpEnabled: false,
      preferences: {},
    },
  },
  fetchUser: vi.fn(async () => {}),
  clearUser: vi.fn(),
}));

const InputStub = defineComponent({
  inheritAttrs: false,
  props: {
    modelValue: {
      type: String,
      default: "",
    },
  },
  emits: ["update:modelValue"],
  setup(props, { attrs, emit }) {
    return () =>
      h("input", {
        ...attrs,
        value: props.modelValue,
        onInput: (event: Event) =>
          emit("update:modelValue", (event.target as HTMLInputElement).value),
      });
  },
});

const SelectStub = defineComponent({
  props: {
    modelValue: {
      type: [String, Number],
      default: "",
    },
  },
  emits: ["update:modelValue"],
  setup(props, { emit, slots }) {
    return () =>
      h(
        "select",
        {
          value: props.modelValue,
          onChange: (event: Event) =>
            emit(
              "update:modelValue",
              (event.target as HTMLSelectElement).value,
            ),
        },
        slots.default?.(),
      );
  },
});

const PassThroughStub = defineComponent({
  inheritAttrs: false,
  setup(_, { slots }) {
    return () => slots.default?.();
  },
});

const EmptyStub = defineComponent({
  setup() {
    return () => null;
  },
});

const SelectItemStub = defineComponent({
  props: {
    value: {
      type: [String, Number],
      required: true,
    },
  },
  setup(props, { slots }) {
    return () => h("option", { value: props.value }, slots.default?.());
  },
});

vi.mock("@/components/ui/input", () => ({
  Input: InputStub,
}));

vi.mock("@/components/ui/select", () => ({
  Select: SelectStub,
  SelectContent: PassThroughStub,
  SelectItem: SelectItemStub,
  SelectTrigger: EmptyStub,
  SelectValue: EmptyStub,
}));

vi.mock("vue-sonner", () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

vi.mock("@/features/Auth/composables/useUser", () => ({
  useUser: () => ({
    user: authMock.user,
    isLoading: { value: false },
    error: { value: null },
    fetchUser: authMock.fetchUser,
    clearUser: authMock.clearUser,
  }),
}));

vi.mock("astro:actions", () => ({
  actions: {
    email: {
      connections: {
        list: vi.fn(async () => ({ data: [], error: null })),
        create: vi.fn(),
        verify: vi.fn(),
        sendTest: vi.fn(),
        update: vi.fn(),
        replaceSecret: vi.fn(),
        delete: vi.fn(),
      },
      routes: {
        list: vi.fn(async () => ({ data: [], error: null })),
        replacePurpose: vi.fn(),
      },
      outbox: {
        overview: vi.fn(async () => ({ data: {}, error: null })),
        list: vi.fn(async () => ({
          data: { items: [], nextCursor: null },
          error: null,
        })),
        retry: vi.fn(),
        cancel: vi.fn(),
      },
    },
  },
}));

async function mountConnectionsView() {
  const EmailView = (
    await import("../../../admin/features/Email/EmailView.vue")
  ).default;
  const wrapper = mount(EmailView, {
    attachTo: document.body,
  });
  await flushPromises();
  await wrapper
    .findAll("button")
    .find((button) => button.text() === "Connections")
    ?.trigger("click");
  await flushPromises();
  return wrapper;
}

async function openAddConnection(provider: "cloudflare_email" | "smtp") {
  const select = document.querySelector(
    "#settings-tab-actions select",
  ) as HTMLSelectElement | null;
  expect(select).not.toBeNull();
  select!.value = provider;
  select!.dispatchEvent(new Event("change"));
  await flushPromises();
}

function smtpConnection(
  overrides: Partial<EmailConnection> = {},
): EmailConnection {
  const connection: EmailConnection = {
    id: "11111111-1111-4111-8111-111111111111",
    siteId: "default",
    name: "SMTP",
    provider: "smtp",
    enabled: true,
    fromEmail: "sender@example.com",
    fromName: "Aria Mail",
    replyToEmail: null,
    config: {
      host: "smtp.example.com",
      port: 465,
      security: "tls",
      username: "account",
      authMethod: "plain",
    },
    credentialState: "configured",
    healthState: "untested",
    lastCheckedAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdByUserId: "admin",
    updatedByUserId: "admin",
  };
  return { ...connection, ...overrides };
}

describe("EmailView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.user.value = {
      id: "de008119-35c5-42a3-ad66-6e6b620838dc",
      username: "admin",
      email: "admin@example.com",
      role: "administrator",
      totpEnabled: false,
      preferences: {},
    };
    vi.mocked(actions.email.connections.create).mockResolvedValue({
      data: smtpConnection(),
      error: undefined,
    });
    document.body.innerHTML = '<div id="settings-tab-actions"></div>';
  });

  it("submits a normalized SMTP connection payload", async () => {
    const wrapper = await mountConnectionsView();

    await openAddConnection("smtp");
    await wrapper
      .find('input[placeholder="Connection name"]')
      .setValue("  SMTP  ");
    await wrapper
      .find('input[placeholder="From email"]')
      .setValue("  sender@example.com  ");
    await wrapper
      .find('input[placeholder="From name"]')
      .setValue("  Aria Mail  ");
    await wrapper
      .find('input[placeholder="SMTP host"]')
      .setValue("  SMTP.EXAMPLE.COM  ");
    await wrapper.findAll("select")[1].setValue("587");
    await wrapper.find('input[placeholder="Username"]').setValue("  account  ");
    await wrapper.find('input[placeholder="Password"]').setValue("secret");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    const payload = {
      name: "SMTP",
      enabled: true,
      fromEmail: "sender@example.com",
      fromName: "Aria Mail",
      replyToEmail: undefined,
      provider: "smtp",
      config: {
        host: "smtp.example.com",
        port: 587,
        security: "starttls",
        username: "account",
        authMethod: "plain",
      },
      secret: { password: "secret" },
    };
    expect(actions.email.connections.create).toHaveBeenCalledWith(payload);
    expect(EmailConnectionCreateSchema.safeParse(payload).success).toBe(true);
  });

  it("blocks invalid SMTP payloads before calling the action", async () => {
    const wrapper = await mountConnectionsView();

    await openAddConnection("smtp");
    await wrapper.find('input[placeholder="Connection name"]').setValue("SMTP");
    await wrapper
      .find('input[placeholder="From email"]')
      .setValue("sender@example.com");
    await wrapper
      .find('input[placeholder="SMTP host"]')
      .setValue("smtp.example.com");
    await wrapper.find('input[placeholder="Password"]').setValue("secret");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(actions.email.connections.create).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith(
      expect.stringContaining("Check the connection details"),
    );
  });

  it("shows setup guidance when email encryption is not configured", async () => {
    vi.mocked(actions.email.connections.create).mockResolvedValue({
      data: undefined,
      error: { message: "EMAIL_KEY_ID_UNAVAILABLE" } as never,
    });
    const wrapper = await mountConnectionsView();

    await openAddConnection("smtp");
    await wrapper.find('input[placeholder="Connection name"]').setValue("SMTP");
    await wrapper
      .find('input[placeholder="From email"]')
      .setValue("sender@example.com");
    await wrapper
      .find('input[placeholder="SMTP host"]')
      .setValue("smtp.example.com");
    await wrapper.find('input[placeholder="Username"]').setValue("account");
    await wrapper.find('input[placeholder="Password"]').setValue("secret");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(toastErrorMock).toHaveBeenCalledWith(
      expect.stringContaining("ARIA_EMAIL_SECRET_KEY_ID"),
    );
  });

  it("hides the add connection form until a provider is selected", async () => {
    const wrapper = await mountConnectionsView();

    expect(wrapper.find("form").exists()).toBe(false);
  });

  it("defaults the test recipient to the signed-in user's email", async () => {
    const wrapper = await mountConnectionsView();

    const input = wrapper.find('input[placeholder="Test recipient address"]');

    expect(authMock.fetchUser).toHaveBeenCalled();
    expect((input.element as HTMLInputElement).value).toBe("admin@example.com");
  });

  it("opens the SMTP form from the add connection control", async () => {
    const wrapper = await mountConnectionsView();

    await openAddConnection("smtp");

    expect(wrapper.find('input[placeholder="SMTP host"]').exists()).toBe(true);
    expect(
      wrapper.find('input[placeholder="Cloudflare account ID"]').exists(),
    ).toBe(false);
  });

  it("reveals saved SMTP details from the connection card", async () => {
    vi.mocked(actions.email.connections.list).mockResolvedValue({
      data: [smtpConnection()],
      error: undefined,
    });
    const wrapper = await mountConnectionsView();

    await wrapper.find("article button").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("smtp.example.com");
    expect(wrapper.text()).toContain("465");
    expect(wrapper.text()).toContain("account");
    expect(wrapper.text()).toContain("Configured");
  });

  it("updates SMTP settings and replaces the secret when a new password is provided", async () => {
    vi.mocked(actions.email.connections.list).mockResolvedValue({
      data: [smtpConnection()],
      error: undefined,
    });
    vi.mocked(actions.email.connections.update).mockResolvedValue({
      data: smtpConnection({ name: "SMTP Updated" }),
      error: undefined,
    });
    vi.mocked(actions.email.connections.replaceSecret).mockResolvedValue({
      data: { success: true },
      error: undefined,
    });
    const wrapper = await mountConnectionsView();

    await wrapper.find("article button").trigger("click");
    await flushPromises();
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Edit")
      ?.trigger("click");
    await flushPromises();

    await wrapper
      .find('input[placeholder="Connection name"]')
      .setValue("SMTP Updated");
    await wrapper
      .find('input[placeholder="SMTP host"]')
      .setValue("smtp2.example.com");
    await wrapper.find("form select").setValue("587");
    await wrapper.find('input[placeholder="Username"]').setValue("account2");
    await wrapper
      .find('input[placeholder="New SMTP password (optional)"]')
      .setValue("new-secret");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(actions.email.connections.update).toHaveBeenCalledWith({
      id: "11111111-1111-4111-8111-111111111111",
      patch: expect.objectContaining({
        name: "SMTP Updated",
        config: {
          host: "smtp2.example.com",
          port: 587,
          security: "starttls",
          username: "account2",
          authMethod: "plain",
        },
      }),
    });
    expect(actions.email.connections.replaceSecret).toHaveBeenCalledWith({
      id: "11111111-1111-4111-8111-111111111111",
      secret: { password: "new-secret" },
    });
  });

  it("opens the Cloudflare Email form from the add connection control", async () => {
    const wrapper = await mountConnectionsView();

    await openAddConnection("cloudflare_email");

    expect(
      wrapper.find('input[placeholder="Cloudflare account ID"]').exists(),
    ).toBe(true);
    expect(wrapper.find('input[placeholder="SMTP host"]').exists()).toBe(false);
  });

  it("closes the add form after successful creation", async () => {
    const wrapper = await mountConnectionsView();

    await openAddConnection("cloudflare_email");
    await wrapper
      .find('input[placeholder="Connection name"]')
      .setValue("Cloudflare");
    await wrapper
      .find('input[placeholder="From email"]')
      .setValue("sender@example.com");
    await wrapper
      .find('input[placeholder="Cloudflare account ID"]')
      .setValue("account");
    await wrapper.find('input[placeholder="Zone ID"]').setValue("zone");
    await wrapper
      .find('input[placeholder="Onboarded sending domain"]')
      .setValue("example.com");
    await wrapper
      .find('input[placeholder="Email Sending API token"]')
      .setValue("token");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find("form").exists()).toBe(false);
  });

  it("saves route changes immediately from the selector", async () => {
    const connectionId = "11111111-1111-4111-8111-111111111111";
    vi.mocked(actions.email.connections.list).mockResolvedValue({
      data: [smtpConnection({ id: connectionId })],
      error: undefined,
    });
    vi.mocked(actions.email.routes.replacePurpose).mockResolvedValue({
      data: [],
      error: undefined,
    });
    const EmailView = (
      await import("../../../admin/features/Email/EmailView.vue")
    ).default;
    const wrapper = mount(EmailView, { attachTo: document.body });
    await flushPromises();
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Routing")
      ?.trigger("click");
    await flushPromises();

    await wrapper.findAll("select")[0].setValue(connectionId);
    await flushPromises();

    expect(actions.email.routes.replacePurpose).toHaveBeenCalledWith({
      purpose: "system",
      connectionIds: [connectionId],
    });
  });
});
