import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ImportConfigDialog from "../../../admin/features/Design/dialogs/ImportConfigDialog.vue";
import { exportToJSON, importFromJSON } from "../../../lib/design/export";
import type { DesignSystemColors } from "../../../lib/design/types";

const { exportJSONMock } = vi.hoisted(() => ({
  exportJSONMock: vi.fn(),
}));

vi.mock("../../../admin/features/Design/composables/useDesignSystem", () => ({
  useDesignSystem: () => ({
    exportJSON: exportJSONMock,
    importJSON: vi.fn(),
  }),
}));

vi.mock("vue-sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/components/ui/button", () => ({
  Button: defineComponent({
    emits: ["click"],
    setup(_, { emit, slots }) {
      return () =>
        h("button", { onClick: () => emit("click") }, slots.default?.());
    },
  }),
}));

vi.mock("@/components/ui/dialog", () => {
  const Passthrough = defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  });

  return {
    Dialog: Passthrough,
    DialogContent: Passthrough,
    DialogDescription: Passthrough,
    DialogFooter: Passthrough,
    DialogHeader: Passthrough,
    DialogTitle: Passthrough,
  };
});

vi.mock("@/components/ui/tabs", () => {
  const Passthrough = defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  });

  return {
    Tabs: Passthrough,
    TabsContent: Passthrough,
    TabsList: Passthrough,
    TabsTrigger: Passthrough,
  };
});

const testColors: DesignSystemColors = {
  activeTemplateId: "custom",
  palettes: {
    primary: {
      25: "#f8fbff",
      50: "#eff6ff",
      100: "#dbeafe",
      200: "#bfdbfe",
      300: "#93c5fd",
      400: "#60a5fa",
      500: "#3b82f6",
      600: "#2563eb",
      700: "#1d4ed8",
      800: "#1e40af",
      900: "#1e3a8a",
      950: "#172554",
      DEFAULT: "#3b82f6",
    },
  },
  semantic: {
    success: "#22c55e",
    warning: "#f59e0b",
    error: "#ef4444",
    info: "#3b82f6",
  },
};

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe("ImportConfigDialog templates", () => {
  let createObjectURLMock: ReturnType<typeof vi.fn>;
  let revokeObjectURLMock: ReturnType<typeof vi.fn>;
  let clickMock: ReturnType<typeof vi.spyOn>;
  let clickedAnchor: HTMLAnchorElement | null;

  beforeEach(() => {
    clickedAnchor = null;
    createObjectURLMock = vi.fn(() => "blob:aria-template");
    revokeObjectURLMock = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURLMock,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURLMock,
    });
    clickMock = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        clickedAnchor = this;
      });
    exportJSONMock.mockReturnValue(
      exportToJSON(testColors, { name: "Aria Design System Template" }),
    );
  });

  afterEach(() => {
    clickMock.mockRestore();
    vi.clearAllMocks();
  });

  it("downloads an importable template in the design-system context", async () => {
    const wrapper = mount(ImportConfigDialog, {
      props: {
        open: true,
      },
      attachTo: document.body,
    });

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Download sample template"))
      ?.trigger("click");

    expect(exportJSONMock).toHaveBeenCalledWith("Aria Design System Template");
    expect(clickedAnchor?.download).toBe("aria-design-system-template.json");
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:aria-template");

    const blob = createObjectURLMock.mock.calls[0]?.[0] as Blob;
    const result = importFromJSON(await readBlobText(blob));

    expect(result.success).toBe(true);

    wrapper.unmount();
  });

  it("keeps the variables template for variables imports", async () => {
    const wrapper = mount(ImportConfigDialog, {
      props: {
        open: true,
        context: "variables",
      },
      attachTo: document.body,
    });

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Download sample template"))
      ?.trigger("click");

    expect(exportJSONMock).not.toHaveBeenCalled();
    expect(clickedAnchor?.download).toBe("aria-variables-template.json");

    const blob = createObjectURLMock.mock.calls[0]?.[0] as Blob;
    const template = JSON.parse(await readBlobText(blob));

    expect(template.custom).toBeDefined();
    expect(template.aliases).toBeDefined();

    wrapper.unmount();
  });
});
