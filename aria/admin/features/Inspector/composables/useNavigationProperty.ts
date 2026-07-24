import { computed, watch } from "vue";
import { actions } from "astro:actions";
import { z } from "zod";
import { usePropertySave } from "../../Core";
import { useSelectedNodeState } from "../../Core/composables/useSelectedNodeState";
import { useHistory } from "../../History";
import { usePropsEditor } from "./usePropsEditor";
import { useInspectorPanelControls } from "./useInspectorPanelControls";
import {
  NavigationPropsSchema,
  parseNavigationProps,
  type NavigationProps,
} from "../../../../lib/blocks/navigationSchema";
import { NAVIGATION_PRESET_CLASS_NAMES } from "../../../../lib/blocks/navigationPresetClasses";
import type { BuilderNode, NodeDataSource } from "../../../../lib/types/nodes";
import {
  BuilderNodeSchema,
  NodeDataSourceSchema,
} from "../../../../lib/schemas/nodes";
import { useCanonicalBreakpoints } from "../../../composables/useCanonicalBreakpoints";
import { generateNodeId } from "../../../../lib/ids/nodeId";

type NavigationSourceMode = "static" | "cms" | "mixed";

const FieldPathSchema = z.string().trim().min(1).max(120);

export function useNavigationProperty(options: {
  hasSaveContext: () => boolean;
  currentItemType: () => "page" | "layout" | "component" | undefined;
  currentItemSlug: () => string | undefined;
}) {
  const { selectedNode, saveNodeUpdates } = usePropertySave();
  const {
    resolveNode,
    replaceSelectedNode,
    updateSelectedNodeDataSource,
  } = useSelectedNodeState();
  const { execute } = useHistory();
  const propsEditor = usePropsEditor();
  const { isPanelDisabled } = useInspectorPanelControls({
    hasSaveContext: options.hasSaveContext,
    isLoading: computed(() => false),
  });
  const { activeBreakpoints } = useCanonicalBreakpoints({ autoLoad: true });

  const navProps = computed(() =>
    parseNavigationProps(selectedNode.value?.props ?? {}),
  );

  const sourceMode = computed(() => navProps.value.sourceMode);

  const cmsCollections = computed(() =>
    propsEditor.collections.value.filter((collection) =>
      ["config", "content", "data"].includes(collection.kind),
    ),
  );

  const repeaterFieldOptions = computed(() => {
    const collection = propsEditor.selectedCollection.value;
    if (!collection) return [];
    return collection.schema.fields
      .filter((field) => field.type === "repeater")
      .map((field) => ({
        value: field.key,
        label: field.label,
      }));
  });

  const breakpointOptions = computed(() =>
    activeBreakpoints.value.map((breakpoint) => ({
      value: breakpoint.name,
      label: breakpoint.label || breakpoint.name,
    })),
  );

  const isCmsSource = computed(() => sourceMode.value === "cms");
  const isMixedSource = computed(() => sourceMode.value === "mixed");
  const hasCmsControls = computed(
    () => sourceMode.value === "cms" || sourceMode.value === "mixed",
  );
  const boundCollectionName = computed(
    () => selectedNode.value?.dataSource?.collection ?? "",
  );
  const hasBoundCmsCollection = computed(
    () => boundCollectionName.value.length > 0,
  );
  const loopMode = computed(() => navProps.value.loopMode);
  const isFieldLoop = computed(
    () => hasCmsControls.value && loopMode.value === "field",
  );

  watch(
    () => selectedNode.value?.id,
    async () => {
      const collectionName = selectedNode.value?.dataSource?.collection;
      if (!collectionName) return;

      propsEditor.selectedCollectionName.value = collectionName;
      await propsEditor.loadCmsCollections();
      const collection = propsEditor.collections.value.find(
        (candidate) => candidate.name === collectionName,
      );
      if (collection) {
        await propsEditor.loadCmsEntriesForCollection(collection);
      }
    },
    { immediate: true },
  );

  function isCmsNavItemsNode(child: { type: string; dataSource?: NodeDataSource }) {
    return (
      child.type.toLowerCase() === "nav-items" &&
      child.dataSource?.source === "field" &&
      child.dataSource.mode === "list"
    );
  }

  function findNavItemsNode() {
    return selectedNode.value?.children.find(
      (child) => child.type.toLowerCase() === "nav-items",
    );
  }

  function findCmsNavItemsNode() {
    return selectedNode.value?.children.find(isCmsNavItemsNode);
  }

  function findManualNavItemsNode() {
    return selectedNode.value?.children.find(
      (child) => child.type.toLowerCase() === "nav-items" && !isCmsNavItemsNode(child),
    );
  }

  function createCmsNavItemsNode(fieldPath = "items"): BuilderNode {
    return {
      id: generateNodeId(),
      type: "nav-items",
      props: {},
      styles: {},
      classNames: { base: [] },
      customClasses: [NAVIGATION_PRESET_CLASS_NAMES.items],
      dataSource: {
        type: "static",
        source: "field",
        mode: "list",
        field: fieldPath,
        entryScope: "context",
      } satisfies NodeDataSource,
      children: [
        {
          id: generateNodeId(),
          type: "nav-item",
          props: {
            submenuType: "none",
            visibility: "all",
          },
          styles: {},
          classNames: { base: [] },
          customClasses: [NAVIGATION_PRESET_CLASS_NAMES.item],
          children: [
            {
              id: generateNodeId(),
              type: "link",
              props: {
                text: "Menu item",
                href: "#",
              },
              styles: {},
              classNames: { base: [] },
              customClasses: [NAVIGATION_PRESET_CLASS_NAMES.link],
              children: [],
              dataSource: {
                type: "static",
                bindings: {
                  text: "label",
                  href: "link",
                },
              } satisfies NodeDataSource,
            },
          ],
        },
      ],
    };
  }

  function collectionName() {
    const itemType = options.currentItemType();
    if (itemType === "page") return "pages" as const;
    if (itemType === "layout") return "layouts" as const;
    if (itemType === "component") return "components" as const;
    return null;
  }

  async function mutateNodeDataSource(
    nodeId: string,
    dataSource: NodeDataSource | undefined,
    description: string,
  ) {
    const collection = collectionName();
    const id = options.currentItemSlug();
    if (!collection || !id) {
      return { success: false as const, error: "Missing editor context" };
    }

    const previousDataSource = resolveNode(nodeId)?.dataSource;
    const persist = async (nextDataSource: NodeDataSource | undefined) => {
      const response = await actions.nodes.mutate({
        collection,
        id,
        nodeId,
        updates: { dataSource: nextDataSource ?? null },
        breakpoint: "base",
      });
      if (response.error) {
        throw new Error(response.error.message);
      }
    };

    const result = await execute({
      type: "update-node-props",
      timestamp: Date.now(),
      description,
      affectedNodeIds: [nodeId],
      undo: async () => {
        await persist(previousDataSource);
        updateSelectedNodeDataSource(nodeId, previousDataSource ?? null);
      },
      redo: async () => {
        await persist(dataSource);
        updateSelectedNodeDataSource(nodeId, dataSource ?? null);
      },
    });

    return result.success
      ? { success: true as const }
      : {
          success: false as const,
          error: result.error?.message ?? "Failed to update navigation source",
        };
  }

  async function replaceNavigationNode(node: BuilderNode, description: string) {
    const collection = collectionName();
    const id = options.currentItemSlug();
    if (!collection || !id) {
      return { success: false as const, error: "Missing editor context" };
    }

    const currentNode = resolveNode(node.id) ?? selectedNode.value;
    if (!currentNode) {
      return { success: false as const, error: "Navigation node not found" };
    }
    const previousNode = BuilderNodeSchema.parse(
      JSON.parse(JSON.stringify(currentNode)),
    );
    const nextNode = BuilderNodeSchema.parse(JSON.parse(JSON.stringify(node)));
    const persist = async (next: BuilderNode) => {
      const response = await actions.nodes.replaceNode({
        collection,
        id,
        nodeId: next.id,
        node: next,
      });
      if (response.error) {
        throw new Error(response.error.message);
      }
    };

    const result = await execute({
      type: "update-node",
      timestamp: Date.now(),
      description,
      affectedNodeIds: [node.id],
      undo: async () => {
        await persist(previousNode);
        replaceSelectedNode(node.id, previousNode);
      },
      redo: async () => {
        await persist(nextNode);
        replaceSelectedNode(node.id, nextNode);
      },
    });

    return result.success
      ? { success: true as const }
      : {
          success: false as const,
          error: result.error?.message ?? "Failed to update navigation",
        };
  }

  async function ensureCmsNavItemsGroup(fieldPath = navProps.value.fieldPath ?? "items") {
    const node = selectedNode.value;
    if (!node) {
      return { success: false as const, error: "No node selected" };
    }
    const existing = findCmsNavItemsNode();
    if (existing) {
      return { success: true as const, node: existing };
    }

    const navToggleIndex = node.children.findIndex(
      (child) => child.type.toLowerCase() === "nav-toggle",
    );
    const nextChildren = [...node.children];
    const insertIndex = navToggleIndex >= 0 ? navToggleIndex : nextChildren.length;
    const cmsItems = createCmsNavItemsNode(fieldPath);
    nextChildren.splice(insertIndex, 0, cmsItems);

    const result = await replaceNavigationNode(
      { ...node, children: nextChildren },
      "Add CMS navigation items",
    );
    return result.success
      ? { success: true as const, node: cmsItems }
      : { success: false as const, error: "Failed to add CMS navigation items" };
  }

  async function updateNavProps(
    patch: Partial<NavigationProps>,
    description: string,
  ) {
    const node = selectedNode.value;
    if (!node) {
      return { success: false as const, error: "No node selected" };
    }

    const nextProps = NavigationPropsSchema.parse({
      ...navProps.value,
      ...patch,
    });

    const success = await saveNodeUpdates(
      { props: { ...node.props, ...nextProps } },
      options.currentItemType(),
      options.currentItemSlug(),
      node.id,
    );
    return success
      ? { success: true as const }
      : { success: false as const, error: `Failed to ${description}` };
  }

  async function persistNavigationDataSource(
    nextDataSource: NodeDataSource | undefined,
    description: string,
  ) {
    const node = selectedNode.value;
    if (!node) {
      return { success: false as const, error: "No node selected" };
    }

    return mutateNodeDataSource(node.id, nextDataSource, description);
  }

  async function setSourceMode(mode: NavigationSourceMode) {
    const result = await updateNavProps(
      { sourceMode: mode },
      `Set navigation source to ${mode}`,
    );
    if (!result.success) return result;

    if (mode === "static") {
      await persistNavigationDataSource(undefined, "Clear navigation CMS source");
      const node = selectedNode.value;
      if (node) {
        const nextChildren = node.children.filter(
          (child) => !isCmsNavItemsNode(child),
        );
        await replaceNavigationNode(
          { ...node, children: nextChildren },
          "Remove CMS navigation items",
        );
      }
      return result;
    }

    if (mode === "mixed") {
      await ensureCmsNavItemsGroup();
    }

    return result;
  }

  async function handleCollectionChange(collectionName: string) {
    await propsEditor.updateCmsCollection(collectionName);
    if (navProps.value.loopMode === "field") {
      await propsEditor.updateCmsDataSourceMode("single");
      return;
    }
    await propsEditor.updateCmsDataSourceMode("list");
  }

  async function setLoopMode(mode: "collection" | "field") {
    const result = await updateNavProps(
      { loopMode: mode },
      `Set navigation loop mode to ${mode}`,
    );
    if (!result.success) return result;

    if (mode === "collection") {
      await propsEditor.updateCmsDataSourceMode("list");
      const navItems = findCmsNavItemsNode() ?? findNavItemsNode();
      if (navItems?.dataSource) {
        await mutateNodeDataSource(
          navItems.id,
          undefined,
          "Clear navigation field loop",
        );
      }
      return result;
    }

    await propsEditor.updateCmsDataSourceMode("single");
    const fieldPath =
      navProps.value.fieldPath ?? repeaterFieldOptions.value[0]?.value;
    if (fieldPath) {
      if (isMixedSource.value) {
        await ensureCmsNavItemsGroup(fieldPath);
      }
      await applyFieldLoopSource(fieldPath);
    }
    return result;
  }

  async function applyFieldLoopSource(fieldPath: string) {
    const parsedField = FieldPathSchema.parse(fieldPath);
    const collection = propsEditor.selectedCollection.value;
    const current = selectedNode.value?.dataSource;
    if (!collection || !current) {
      return { success: false as const, error: "Select a collection first" };
    }

    const navItems =
      hasCmsControls.value
        ? findCmsNavItemsNode() ?? findNavItemsNode()
        : findManualNavItemsNode() ?? findNavItemsNode();
    if (!navItems) {
      return { success: false as const, error: "Navigation is missing nav items" };
    }

    await updateNavProps({ fieldPath: parsedField }, "Set navigation field loop");

    await persistNavigationDataSource(
      NodeDataSourceSchema.unwrap().parse({
        type: current.type === "cms" ? "cms" : "collection",
        collection: collection.name,
        mode: "single",
        filter: current.filter,
      }),
      "Set navigation entry scope",
    );

    return mutateNodeDataSource(
      navItems.id,
      NodeDataSourceSchema.unwrap().parse({
        type: "static",
        source: "field",
        mode: "list",
        field: parsedField,
        entryScope: "context",
      } satisfies NodeDataSource),
      "Set navigation field loop source",
    );
  }

  async function handleEntryChange(entryId: string) {
    const entry =
      propsEditor.cmsEntryOptions.value.find((option) => option.id === entryId) ??
      { id: entryId };
    await propsEditor.updateCmsSingleEntry(entry.id, entry);
    if (isFieldLoop.value && navProps.value.fieldPath) {
      await applyFieldLoopSource(navProps.value.fieldPath);
    }
  }

  return {
    propsEditor,
    isPanelDisabled,
    navProps,
    sourceMode,
    cmsCollections,
    repeaterFieldOptions,
    breakpointOptions,
    isCmsSource,
    isMixedSource,
    hasCmsControls,
    boundCollectionName,
    hasBoundCmsCollection,
    loopMode,
    isFieldLoop,
    updateNavProps,
    setSourceMode,
    handleCollectionChange,
    setLoopMode,
    applyFieldLoopSource,
    handleEntryChange,
  };
}
