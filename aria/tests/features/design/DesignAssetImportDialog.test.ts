import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import DesignAssetImportDialog from "../../../admin/features/Design/dialogs/DesignAssetImportDialog.vue";
import { createDefaultGlobalStylesConfig } from "../../../lib/styles/universalDesignSystem";

const { applyDesignImportMock } = vi.hoisted(() => ({
  applyDesignImportMock: vi.fn(),
}));

vi.mock("../../../admin/features/Design/composables/useDesignImporter", () => ({
  useDesignImporter: () => ({
    isImporting: false,
    applyDesignImport: applyDesignImportMock,
  }),
}));

function passthrough(name = "div") {
  return defineComponent({
    props: ["modelValue", "open", "class", "variant", "size"],
    emits: ["click", "update:modelValue", "update:open", "select"],
    setup(props, { emit, slots, attrs }) {
      return () =>
        h(
          name,
          {
            ...attrs,
            class: props.class,
            onClick: () => emit("click"),
          },
          slots.default?.(),
        );
    },
  });
}

vi.mock("@/components/ui/dialog", () => ({
  Dialog: passthrough(),
  DialogDescription: passthrough("p"),
  DialogHeader: passthrough(),
  DialogScrollContent: passthrough(),
  DialogTitle: passthrough("h2"),
}));

vi.mock("@/components/ui/button", () => ({
  Button: passthrough("button"),
}));

vi.mock("@/components/ui/alert", () => ({
  Alert: passthrough(),
  AlertDescription: passthrough("p"),
  AlertTitle: passthrough("strong"),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: passthrough("span"),
}));

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: defineComponent({
    props: ["modelValue"],
    emits: ["update:modelValue"],
    setup(props, { emit }) {
      return () =>
        h("button", {
          role: "checkbox",
          "aria-checked": props.modelValue ? "true" : "false",
          onClick: () => emit("update:modelValue", !props.modelValue),
        });
    },
  }),
}));

vi.mock("@/components/ui/command", () => ({
  Command: passthrough(),
  CommandGroup: passthrough(),
  CommandInput: passthrough("input"),
  CommandItem: defineComponent({
    props: ["value", "class"],
    emits: ["select"],
    setup(props, { emit, slots }) {
      return () =>
        h(
          "button",
          { class: props.class, onClick: () => emit("select", props.value) },
          slots.default?.(),
        );
    },
  }),
  CommandList: passthrough(),
}));

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: passthrough(),
}));

vi.mock("@/components/ui/separator", () => ({
  Separator: passthrough(),
}));

vi.mock("@/components/ui/select", () => ({
  Select: passthrough(),
  SelectContent: passthrough(),
  SelectItem: passthrough(),
  SelectTrigger: passthrough(),
  SelectValue: passthrough(),
}));

vi.mock("@/components/ui/textarea", () => ({
  Textarea: defineComponent({
    props: ["modelValue", "class", "placeholder"],
    emits: ["update:modelValue"],
    setup(props, { emit }) {
      return () =>
        h("textarea", {
          class: props.class,
          placeholder: props.placeholder,
          value: props.modelValue,
          onInput: (event: Event) =>
            emit("update:modelValue", (event.target as HTMLTextAreaElement).value),
        });
    },
  }),
}));

describe("DesignAssetImportDialog", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders detected import groups from pasted design JSON", async () => {
    vi.useFakeTimers();

    const wrapper = mount(DesignAssetImportDialog, {
      props: { open: true },
    });

    await wrapper.find("textarea").setValue(
      JSON.stringify({
        exportedAt: "2026-01-01T00:00:00.000Z",
        colors: {
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
        },
        globalStyles: createDefaultGlobalStylesConfig(),
      }),
    );
    await vi.advanceTimersByTimeAsync(200);
    await nextTick();

    expect(wrapper.text()).toContain("Colors");
    expect(wrapper.text()).toContain("Global Styles");
  });

  it("calls the importer for selected sections", async () => {
    vi.useFakeTimers();
    applyDesignImportMock.mockResolvedValue(true);

    const wrapper = mount(DesignAssetImportDialog, {
      props: { open: true, allowedSections: ["variables"] },
    });

    await wrapper.find("textarea").setValue(":root { --brand-primary: #2d49b7; }");
    await vi.advanceTimersByTimeAsync(200);
    await nextTick();
    const importButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Import Selected"));

    expect(importButton).toBeDefined();
    await importButton?.trigger("click");

    expect(applyDesignImportMock).toHaveBeenCalledOnce();
  });

  it("detects raw css class imports", async () => {
    vi.useFakeTimers();

    const wrapper = mount(DesignAssetImportDialog, {
      props: { open: true, allowedSections: ["classes"] },
    });

    await wrapper
      .find("textarea")
      .setValue(".reveal { opacity: 0; }\n.reveal.active { opacity: 1; }");
    await vi.advanceTimersByTimeAsync(200);
    await nextTick();

    expect(wrapper.text()).toContain("Classes");
    const importButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Import Selected"));
    expect(importButton?.attributes("disabled")).toBeUndefined();
  });
});
