import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref, shallowRef } from "vue";

import type { AriaCollection, AriaEntryRecord } from "../../../lib/cms/schemas";
import { formatCmsDateValue } from "../../../lib/cms/dateBindingFormats";
import type {
  BuilderNode,
  NodeDataSource,
} from "../../../lib/types/nodes";

const broadcastPropsUpdate = vi.fn();
const batchUpdate = vi.fn();
const updateProperty = vi.fn();

const testNode = shallowRef<BuilderNode | null>(null);

const blogCollection = {
  id: "collection-blog",
  name: "blog",
  label: "Blog",
  kind: "content",
  schema: {
    id: "collection-blog",
    label: "Blog",
    kind: "content",
    fields: [
      {
        key: "publishedDate",
        label: "Published date",
        type: "date",
      },
    ],
    version: 1,
  },
  scope: "global",
  urlPattern: "/blog/{slug}",
  templatePageId: "page-template",
  listPageId: null,
  supports: [],
  createdAt: "2026-06-26T00:00:00.000Z",
  updatedAt: "2026-06-26T00:00:00.000Z",
} satisfies AriaCollection;

const blogEntry = {
  entry: {
    id: "entry-1",
    collectionId: "collection-blog",
    status: "published",
    version: "1",
    authorId: "author-1",
    publishedAt: "2026-07-07T17:13:01.028Z",
    updatedAt: "2026-07-07T17:13:01.028Z",
    createdAt: "2026-07-07T17:13:01.028Z",
    scheduledFor: null,
  },
  locales: [
    {
      entryId: "entry-1",
      collectionId: "collection-blog",
      locale: "en",
      isSource: true,
      slug: "hello-world",
      title: "Hello world",
      body: "",
      frontmatter: {
        publishedDate: "2026-07-07",
      },
    },
  ],
} satisfies AriaEntryRecord;

vi.mock("astro:actions", () => ({
  actions: {
    cms: {
      collections: {
        list: vi.fn(async () => ({
          data: { collections: [blogCollection], entryCounts: {} },
          error: null,
        })),
      },
      entries: {
        list: vi.fn(async () => ({
          data: {
            items: [blogEntry],
            total: 1,
            page: 1,
            limit: 100,
          },
          error: null,
        })),
      },
    },
    mutate: vi.fn(),
  },
}));

vi.mock("../../../admin/features/Core", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../../../admin/features/Core")
  >();

  return {
    ...actual,
    useCanvasSignalBridge: () => ({ broadcastPropsUpdate }),
    useSelectionTreeState: () => ({
      selectionTreeRootNodes: ref([]),
      setSelectionTreeRootNodes: vi.fn(),
    }),
    useSelectedNodeState: () => ({
      updateSelectedNodeDataSource: vi.fn(),
    }),
  };
});

vi.mock("../../../admin/features/Inspector/composables/useInspector", () => ({
  useInspector: () => ({
    elementContext: computed(() => ({
      node: testNode.value,
      nodeId: testNode.value?.id ?? null,
      nodeType: testNode.value?.type ?? "None",
    })),
    batchUpdate,
    updateProperty,
  }),
}));

function createDateBoundNode(): BuilderNode {
  return {
    id: "blog-list-card-date",
    type: "text",
    props: { content: "July 7, 2026" },
    styles: {},
    children: [],
    dataSource: {
      type: "collection",
      collection: "blog",
      mode: "single",
      filter: { id: "entry-1" },
      bindings: {
        content: "blog.publishedDate",
      },
    },
  };
}

describe("usePropsEditor date format", () => {
  beforeEach(async () => {
    const { resetPropsEditorForTests } = await import(
      "../../../admin/features/Inspector/composables/usePropsEditor"
    );
    resetPropsEditorForTests();

    broadcastPropsUpdate.mockReset();
    batchUpdate.mockReset();
    updateProperty.mockReset();
    testNode.value = createDateBoundNode();
  });

  async function createEditor() {
    const { usePropsEditor } = await import(
      "../../../admin/features/Inspector/composables/usePropsEditor"
    );
    const editor = usePropsEditor();

    await editor.loadCmsCollections();
    editor.selectedCollectionName.value = "blog";
    await editor.loadCmsEntriesForCollection(blogCollection);

    return editor;
  }

  it("returns pending format immediately while persistence is in flight", async () => {
    let resolveBatch: (value: { success: boolean }) => void = () => {};
    batchUpdate.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveBatch = resolve;
        }),
    );

    const editor = await createEditor();
    expect(editor.dateFormatForProp("content")).toBe("medium");

    const pending = editor.setPropDateFormat("content", "isoDate");
    expect(editor.dateFormatForProp("content")).toBe("isoDate");

    resolveBatch({ success: true });
    await pending;

    expect(editor.dateFormatForProp("content")).toBe("medium");
  });

  it("broadcasts formatted content to the canvas before persistence completes", async () => {
    let resolveBatch: (value: { success: boolean }) => void = () => {};
    batchUpdate.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveBatch = resolve;
        }),
    );

    const editor = await createEditor();
    const pending = editor.setPropDateFormat("content", "isoDate");

    expect(broadcastPropsUpdate).toHaveBeenCalledWith({
      nodeId: "blog-list-card-date",
      props: { content: "2026-07-07" },
      source: "inspector-live",
    });

    resolveBatch({ success: true });
    await pending;

    expect(batchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        dataSource: expect.objectContaining({
          bindingFormats: { content: "isoDate" },
        }),
        "props.content": "2026-07-07",
      }),
      expect.objectContaining({
        description: "Set date format for content",
      }),
    );
  });

  it("clears pending format after a failed persistence attempt", async () => {
    batchUpdate.mockResolvedValue({ success: false, error: "Save failed" });

    const editor = await createEditor();
    await editor.setPropDateFormat("content", "us");

    expect(editor.dateFormatForProp("content")).toBe("medium");
    expect(broadcastPropsUpdate).toHaveBeenCalledWith({
      nodeId: "blog-list-card-date",
      props: {
        content: formatCmsDateValue("2026-07-07", "us"),
      },
      source: "inspector-live",
    });
  });

  it("uses the pre-clear data source as the CMS binding undo snapshot", async () => {
    updateProperty.mockResolvedValue({ success: true });

    const editor = await createEditor();
    const beforeClear = testNode.value?.dataSource;
    await editor.unbindPropFromCms("content");

    expect(updateProperty).toHaveBeenCalledWith(
      "dataSource",
      expect.objectContaining({
        bindings: undefined,
      }),
      expect.objectContaining({
        description: "Clear CMS binding for content",
        restoreValue: beforeClear,
      }),
    );
  });

  it("uses the pre-clear data source as the CMS loop undo snapshot", async () => {
    const beforeClear: NodeDataSource = {
      type: "collection",
      collection: "blog",
      mode: "list",
      limit: 12,
    };
    testNode.value = {
      ...createDateBoundNode(),
      type: "div",
      children: [
        {
          id: "loop-child",
          type: "text",
          props: { content: "Item" },
          styles: {},
          children: [],
        },
      ],
      dataSource: beforeClear,
    };
    updateProperty.mockResolvedValue({ success: true });

    const editor = await createEditor();
    await editor.setPropBindingMode("items", "static");

    expect(updateProperty).toHaveBeenCalledWith(
      "dataSource",
      undefined,
      expect.objectContaining({
        description: "Clear CMS loop source",
        restoreValue: beforeClear,
      }),
    );
  });

  it("clears a saved inline edit override so a later undo can render", async () => {
    updateProperty.mockImplementation(async (_path, value) => {
      testNode.value = {
        ...testNode.value!,
        props: {
          ...testNode.value!.props,
          content: value,
        },
      };
      return { success: true };
    });

    const editor = await createEditor();
    await editor.updateProp("content", "Updated content");
    testNode.value = {
      ...testNode.value!,
      props: { ...testNode.value!.props, content: "Restored content" },
    };

    expect(editor.getProp("content")).toBe("Restored content");
  });
});
