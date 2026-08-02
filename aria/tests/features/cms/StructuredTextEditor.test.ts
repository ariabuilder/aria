import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

type MockEditor = ReturnType<typeof createMockEditor>["editor"];
type MockEditorOptions = {
  onUpdate: (context: { editor: MockEditor }) => void;
};

const tiptapMock = vi.hoisted(() => ({
  editor: null as unknown as MockEditor,
  options: null as MockEditorOptions | null,
  useEditor: vi.fn((options: MockEditorOptions) => {
    tiptapMock.options = options;
    return { value: tiptapMock.editor };
  }),
}));

vi.mock("@tiptap/vue-3", async () => {
  const vue = await vi.importActual<typeof import("vue")>("vue");
  return {
    useEditor: tiptapMock.useEditor,
    VueNodeViewRenderer: vi.fn((component: unknown) => component),
    NodeViewWrapper: vue.defineComponent({
      name: "NodeViewWrapper",
      props: {
        as: {
          type: String,
          default: "div",
        },
      },
      setup(props, { slots, attrs }) {
        return () => vue.h(props.as, attrs, slots.default?.());
      },
    }),
    EditorContent: vue.defineComponent({
      name: "EditorContent",
      props: {
        editor: {
          type: Object,
          required: false,
        },
      },
      setup() {
        return () => vue.h("div", { "data-testid": "editor-content" });
      },
    }),
  };
});

vi.mock("@/features/Studio/media/components/MediaPickerDialog.vue", async () => {
  const vue = await vi.importActual<typeof import("vue")>("vue");
  return {
    default: vue.defineComponent({
      name: "MediaPickerDialog",
      props: {
        open: {
          type: Boolean,
          default: false,
        },
      },
      emits: ["select", "update:open"],
      setup(props, { emit }) {
        const asset = {
          id: "media-hero",
          name: "hero.jpg",
          type: "image",
          url: "/uploads/hero.jpg",
          size: 128,
        };
        return () =>
          props.open
            ? vue.h("div", { "data-testid": "media-picker" }, [
                vue.h(
                  "button",
                  {
                    type: "button",
                    "data-testid": "media-picker-select",
                    onClick: () => emit("select", asset),
                  },
                  "Select",
                ),
              ])
            : null;
      },
    }),
  };
});

const StructuredTextEditor = (
  await import("../../../admin/features/CMS/components/StructuredTextEditor.vue")
).default;

function createMockEditor() {
  const calls: string[] = [];
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const chainMethod = (name: string) =>
    vi.fn((...args: unknown[]) => {
      calls.push(`${name}:${JSON.stringify(args)}`);
      return chain;
    });

  for (const name of [
    "focus",
    "toggleBold",
    "toggleItalic",
    "toggleStrike",
    "toggleUnderline",
    "toggleCode",
    "setParagraph",
    "toggleHeading",
    "toggleBlockquote",
    "toggleBulletList",
    "toggleOrderedList",
    "setHorizontalRule",
    "unsetAllMarks",
    "clearNodes",
    "undo",
    "redo",
    "extendMarkRange",
    "setLink",
    "unsetLink",
    "insertContent",
    "updateAttributes",
  ]) {
    chain[name] = chainMethod(name);
  }
  chain.run = vi.fn(() => {
    calls.push("run:[]");
    return true;
  });

  const active = new Map<string, boolean>();
  const editor = {
    calls,
    active,
    linkAttrs: {},
    embedAttrs: {},
    text: "Hello CMS editor",
    chain: vi.fn(() => chain),
    can: vi.fn(() => ({
      undo: vi.fn(() => true),
      redo: vi.fn(() => true),
    })),
    isActive: vi.fn((name: string, attrs?: Record<string, unknown>) => {
      const key = attrs ? `${name}:${JSON.stringify(attrs)}` : name;
      return active.get(key) ?? false;
    }),
    getAttributes: vi.fn((name: string) =>
      name === "ariaStructuredEmbed" ? editor.embedAttrs : editor.linkAttrs,
    ),
    getText: vi.fn(() => editor.text),
    getJSON: vi.fn(() => ({
      type: "doc",
      content: [{ type: "paragraph" }],
    })),
    commands: {
      setContent: vi.fn(),
    },
    setEditable: vi.fn(),
    destroy: vi.fn(),
  };

  return { editor, chain };
}

function mountEditor() {
  return mount(StructuredTextEditor, {
    props: {
      modelValue: [],
    },
  });
}

describe("StructuredTextEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tiptapMock.editor = createMockEditor().editor;
    tiptapMock.options = null;
  });

  it("calls editor commands from toolbar buttons", async () => {
    const wrapper = mountEditor();

    await wrapper.get('[data-testid="structured-text-bold"]').trigger("click");
    await wrapper.get('[data-testid="structured-text-h4"]').trigger("click");
    await wrapper
      .get('[data-testid="structured-text-divider"]')
      .trigger("click");
    await wrapper
      .get('[data-testid="structured-text-clear-formatting"]')
      .trigger("click");

    expect(tiptapMock.editor.calls).toContain("toggleBold:[]");
    expect(tiptapMock.editor.calls).toContain(
      'toggleHeading:[{"level":4}]',
    );
    expect(tiptapMock.editor.calls).toContain("setHorizontalRule:[]");
    expect(tiptapMock.editor.calls).toContain("unsetAllMarks:[]");
    expect(tiptapMock.editor.calls).toContain("clearNodes:[]");
  });

  it("renders active toolbar state", () => {
    tiptapMock.editor.active.set("bold", true);
    tiptapMock.editor.active.set('heading:{"level":4}', true);

    const wrapper = mountEditor();

    expect(wrapper.get('[data-testid="structured-text-bold"]').attributes("aria-pressed")).toBe(
      "true",
    );
    expect(wrapper.get('[data-testid="structured-text-h4"]').attributes("aria-pressed")).toBe(
      "true",
    );
  });

  it("supports underline formatting", async () => {
    const wrapper = mountEditor();

    await wrapper
      .get('[data-testid="structured-text-underline"]')
      .trigger("click");

    expect(tiptapMock.editor.calls).toContain("toggleUnderline:[]");
  });

  it("applies and removes links through the link dialog", async () => {
    tiptapMock.editor.active.set("link", true);
    tiptapMock.editor.linkAttrs = { href: "/old", target: null };
    const wrapper = mountEditor();

    await wrapper.get('[data-testid="structured-text-link"]').trigger("click");
    const hrefInput = wrapper.get<HTMLInputElement>(
      '[data-testid="structured-text-link-href"]',
    );
    expect(hrefInput.element.value).toBe("/old");

    await hrefInput.setValue("https://example.com");
    await wrapper.get('[data-testid="structured-text-link-new-tab"]').setValue(true);
    await wrapper.get('[data-testid="structured-text-link-apply"]').trigger("click");

    expect(tiptapMock.editor.calls).toContain("extendMarkRange:[\"link\"]");
    expect(tiptapMock.editor.calls).toContain(
      'setLink:[{"href":"https://example.com","target":"_blank","rel":"noopener noreferrer nofollow"}]',
    );

    await wrapper.get('[data-testid="structured-text-unlink"]').trigger("click");
    expect(tiptapMock.editor.calls).toContain("unsetLink:[]");
  });

  it("inserts image blocks from the shared media picker", async () => {
    const wrapper = mountEditor();

    await wrapper.get('[data-testid="structured-text-image"]').trigger("click");
    await wrapper.get('[data-testid="media-picker-select"]').trigger("click");

    expect(tiptapMock.editor.calls).toContain(
      'insertContent:[{"type":"ariaStructuredImage","attrs":{"mediaId":"media-hero","alt":"hero.jpg","caption":""}}]',
    );
  });

  it("applies embed blocks from the embed dialog", async () => {
    const wrapper = mountEditor();

    await wrapper.get('[data-testid="structured-text-embed"]').trigger("click");
    await wrapper
      .get<HTMLInputElement>('[data-testid="structured-text-embed-url"]')
      .setValue("https://youtu.be/abc123");
    await wrapper
      .get('[data-testid="structured-text-embed-apply"]')
      .trigger("click");

    expect(tiptapMock.editor.calls).toContain(
      'insertContent:[{"type":"ariaStructuredEmbed","attrs":{"provider":"youtube","url":"https://youtu.be/abc123"}}]',
    );
  });

  it("updates word, character, and reading-time stats from editor content", async () => {
    const wrapper = mountEditor();
    expect(wrapper.get('[data-testid="structured-text-stats"]').text()).toBe(
      "3 words · 16 characters · 1 min read",
    );

    tiptapMock.editor.text = "One ".repeat(226).trim();
    expect(tiptapMock.options).not.toBeNull();
    tiptapMock.options?.onUpdate({ editor: tiptapMock.editor });
    await nextTick();

    expect(wrapper.get('[data-testid="structured-text-stats"]').text()).toBe(
      "226 words · 903 characters · 2 min read",
    );
  });
});
