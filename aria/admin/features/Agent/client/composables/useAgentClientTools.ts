import { inject, nextTick, ref, type InjectionKey } from "vue";
import { useRoute } from "vue-router";
import { actions } from "astro:actions";
import type { BuilderNode } from "../../../../../lib/types/nodes";
import {
  findNodeById,
  updateNodeById,
  validateNodeTree,
} from "../../../../../lib/blocks/nodeUtils";
import { nodeTreeContainsNavigation } from "../../../../../lib/blocks/navigationPresetClasses";
import { regenerateNodeTreeIds } from "../../../../../lib/ids/nodeId";
import {
  ClientToolInsertDesignedSectionInputSchema,
  ClientToolInsertNodesInputSchema,
  ClientToolOpenInComposerInputSchema,
  ClientToolSelectBlockInputSchema,
  ClientToolUpdateNodeMotionInputSchema,
  ClientToolUploadCustomFontInputSchema,
  type AgentToolError,
} from "../../lib/schemas";
import {
  formatDesignedSectionIssues,
  normalizeDesignedSectionNode,
} from "../../lib/designedSections";
import {
  insertNodeViaAction,
  resolveInsertPosition,
  type InsertNodeViaActionDeps,
} from "../../../Nodes/events/shared/insertNodeViaAction";
import {
  formatAgentNodeNormalizationIssues,
  normalizeAgentNodeTreeForInsert,
} from "../../../../../lib/blocks/agentNodeNormalizer";
import { APP_INJECTION_KEYS } from "../../../Core/types/injectionKeys";
import { useBeacon } from "../../../Beacon";
import { useStudioRouter } from "@/features/Studio/core/composables/useStudioRouter";
import { useStudioCapabilities } from "@/composables/useStudioCapabilities";
import { useUser } from "@/features/Auth/composables/useUser";
import { hasEffectiveCapability } from "../../../../../lib/auth/hasEffectiveCapability";
import { useAppRouter } from "@/features/Core";
import { parseComposerRouteTarget } from "@/lib/router/composerRouteTarget";
import { normalizeEditorSlug } from "@/lib/editor/slugs";
import {
  preflightBuilderNodeArrayInput,
  preflightBuilderNodeInput,
} from "../../../../../lib/rendering/canonical/preflight";
import { renderSurfaceKindForCollection } from "../../../../../lib/rendering/canonical";

export type ClientToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AgentToolError };

type PageBlocksRef = { value: BuilderNode[] };
type NodeMotionValue = NonNullable<BuilderNode["motion"]>;

function toolError(
  code: AgentToolError["code"],
  message: string,
  suggestedFix?: string,
): ClientToolResult<never> {
  return {
    ok: false,
    error: { code, message, suggestedFix },
  };
}

function cloneMotion(
  motion: BuilderNode["motion"] | undefined,
): BuilderNode["motion"] | undefined {
  if (!motion) return undefined;

  try {
    return structuredClone(motion);
  } catch {
    return JSON.parse(JSON.stringify(motion)) as NodeMotionValue;
  }
}

function resolveInsertDeps(): {
  executeNodeEventOperation:
    | InsertNodeViaActionDeps["executeNodeEventOperation"]
    | null;
  resolveMutationPath: InsertNodeViaActionDeps["resolveMutationPath"] | null;
} {
  const nodeEventHandlers = inject(APP_INJECTION_KEYS.nodeEventHandlers, null);
  if (!nodeEventHandlers) {
    return { executeNodeEventOperation: null, resolveMutationPath: null };
  }

  return {
    executeNodeEventOperation: nodeEventHandlers.executeNodeEventOperation,
    resolveMutationPath: nodeEventHandlers.resolveMutationPath,
  };
}

async function waitForCondition(
  check: () => boolean,
  timeoutMs = 5000,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (check()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

export function useAgentClientTools() {
  const route = useRoute();
  const studioRouter = useStudioRouter();
  const appRouter = useAppRouter();
  const caps = useStudioCapabilities();
  const { user } = useUser();
  const injectedPageBlocks = inject(
    APP_INJECTION_KEYS.pageBlocks as InjectionKey<unknown>,
    null,
  ) as PageBlocksRef | null;
  const pageBlocks = injectedPageBlocks ?? (ref([]) as PageBlocksRef);
  const currentLayout = inject(APP_INJECTION_KEYS.currentLayout, ref(null));
  const hasUnsavedChanges = inject(
    APP_INJECTION_KEYS.hasUnsavedChanges,
    ref(false),
  );
  const activeLayoutSlot = inject(APP_INJECTION_KEYS.activeLayoutSlot, null);
  const editorNodeRegistry = inject(
    APP_INJECTION_KEYS.editorNodeRegistry,
    null,
  );
  const { focusedNodeId, illuminate } = useBeacon();
  const { executeNodeEventOperation, resolveMutationPath } =
    resolveInsertDeps();

  async function verifyItemExists(
    itemType: "page" | "layout" | "component",
    slug: string,
  ): Promise<ClientToolResult<true>> {
    const collection =
      itemType === "page"
        ? "pages"
        : itemType === "layout"
          ? "layouts"
          : "components";

    const { data, error } = await actions.getItem({ collection, slug });
    if (error || !data) {
      return toolError(
        "NOT_FOUND",
        `${itemType} not found: ${slug}`,
        `Check the slug with aria_list_${itemType === "page" ? "pages" : `${itemType}s`}.`,
      );
    }

    return { ok: true, data: true };
  }

  async function executeOpenInComposer(input: unknown): Promise<
    ClientToolResult<{
      itemType: string;
      slug: string;
      destination: string;
      alreadyOpen?: boolean;
    }>
  > {
    const parsed = ClientToolOpenInComposerInputSchema.safeParse(input);
    if (!parsed.success) {
      return toolError(
        "INVALID_INPUT",
        "Invalid open_in_composer payload",
        "Provide itemType, slug, and optional destination.",
      );
    }

    const { itemType, destination } = parsed.data;
    const slug = normalizeEditorSlug(parsed.data.slug);

    if (!caps.isReady.value) {
      return toolError(
        "INTERNAL",
        "Studio capabilities are not ready yet.",
        "Retry in a moment.",
      );
    }

    if (!caps.canEditItemInComposer(itemType)) {
      return toolError(
        "FORBIDDEN",
        `You cannot open ${itemType}s in Composer.`,
        caps.getForbiddenMessage(caps.composerOperationForItem(itemType)),
      );
    }

    const exists = await verifyItemExists(itemType, slug);
    if (!exists.ok) {
      return exists;
    }

    if (destination === "composer") {
      const currentTarget = parseComposerRouteTarget(route.path, route.query);
      if (
        currentTarget?.itemType === itemType &&
        currentTarget.itemSlug === slug
      ) {
        return {
          ok: true,
          data: {
            itemType,
            slug,
            destination,
            alreadyOpen: true,
          },
        };
      }

      studioRouter.startEditing(itemType, slug);
      await nextTick();

      const ready = await waitForCondition(() => {
        const editing = appRouter.editingMode.value;
        return (
          editing.isEditing &&
          editing.itemType === itemType &&
          editing.itemSlug === slug
        );
      });

      if (!ready) {
        return toolError(
          "INTERNAL",
          `Timed out opening ${itemType} "${slug}" in Composer.`,
          "Retry open_in_composer or open the page manually.",
        );
      }

      return {
        ok: true,
        data: { itemType, slug, destination },
      };
    }

    const studioPath = `/${itemType}s/${slug}`;
    if (route.fullPath !== studioPath) {
      studioRouter.navigateTo(studioPath);
      await nextTick();
      await waitForCondition(() => route.fullPath === studioPath);
    }

    return {
      ok: true,
      data: { itemType, slug, destination },
    };
  }

  async function executeInsertNodes(
    input: unknown,
  ): Promise<ClientToolResult<{ inserted: number; nodeIds: string[] }>> {
    const parsed = ClientToolInsertNodesInputSchema.safeParse(input);
    if (!parsed.success) {
      return toolError(
        "INVALID_INPUT",
        "Invalid insert_nodes payload",
        "Ensure nodes match BuilderNodeSchema.",
      );
    }

    if (!executeNodeEventOperation || !resolveMutationPath) {
      return toolError(
        "NO_OPEN_DOCUMENT",
        "Composer is not open — cannot insert blocks.",
        "Open the target page in Composer first.",
      );
    }

    const mutationPath = resolveMutationPath();
    if (!mutationPath) {
      return toolError(
        "NO_OPEN_DOCUMENT",
        "No open document for insert.",
        "Open a page, layout, or component in Composer.",
      );
    }

    let preflightedNodes: unknown[];
    try {
      preflightedNodes = preflightBuilderNodeArrayInput({
        kind: renderSurfaceKindForCollection(mutationPath.collection),
        nodes: parsed.data.nodes,
      }).source as unknown[];
    } catch {
      return toolError("RENDER_INPUT_INVALID", "The render input is invalid.");
    }

    const normalizedTree = normalizeAgentNodeTreeForInsert(preflightedNodes);
    if (!normalizedTree.ok) {
      return toolError(
        "INVALID_INPUT",
        "Invalid insert_nodes payload",
        formatAgentNodeNormalizationIssues(normalizedTree.issues),
      );
    }

    const nodes = normalizedTree.nodes;
    const treeValidation = validateNodeTree(nodes);
    if (!treeValidation.valid) {
      return toolError(
        "INVALID_INPUT",
        treeValidation.errors.map((e) => e.message).join("; ") ||
          "Invalid node tree",
      );
    }

    const parentId = parsed.data.parentId ?? null;
    const firstInsertPosition = resolveInsertPosition(
      pageBlocks.value,
      parentId,
      parsed.data.insertPosition,
      (nodes, id) => findNodeById(nodes, id) ?? null,
    );
    let inserted = 0;
    const nodeIds: string[] = [];
    for (const [index, node] of nodes.entries()) {
      // Regenerate all node IDs recursively so agent-generated IDs never
      // collide with existing tree IDs or across multiple insert calls.
      const regenerated = regenerateNodeTreeIds(node);
      nodeIds.push(regenerated.id);

      if (nodeTreeContainsNavigation(regenerated)) {
        const ensureResponse =
          await actions.styles.ensureNavigationPresetClasses({});
        if (ensureResponse.error) {
          return toolError(
            "INVALID_INPUT",
            ensureResponse.error.message,
            "Ensure navigation preset classes can be created before inserting navigation.",
          );
        }
      }

      const result = await insertNodeViaAction(
        {
          pageBlocks:
            pageBlocks as unknown as InsertNodeViaActionDeps["pageBlocks"],
          currentLayout,
          activeSlot: activeLayoutSlot?.activeSlot,
          editorNodeRegistry: editorNodeRegistry ?? undefined,
          executeNodeEventOperation,
          // Agent inserts are collaborative background work. Do not steal the
          // user's current Layers/Inspector selection when new content lands.
          setSelectedBlock: () => {},
          resolveMutationPath,
          findNodeById: (nodes, id) => findNodeById(nodes, id) ?? null,
        },
        {
          newNode: regenerated,
          parentId,
          insertPosition: firstInsertPosition + index,
          historyDescription: `Agent insert ${node.type}`,
        },
      );

      if (!result.ok) {
        if (result.reason === "missing-context") {
          return toolError("NO_OPEN_DOCUMENT", result.message);
        }
        return toolError("INVALID_INPUT", result.message);
      }
      inserted += 1;
    }

    return { ok: true, data: { inserted, nodeIds } };
  }

  async function executeInsertDesignedSection(input: unknown): Promise<
    ClientToolResult<{
      inserted: number;
      nodeIds: string[];
    }>
  > {
    const parsed = ClientToolInsertDesignedSectionInputSchema.safeParse(input);
    if (!parsed.success) {
      return toolError(
        "INVALID_INPUT",
        "Invalid insert_designed_section payload",
        "Provide exactly one root section node.",
      );
    }

    const mutationPath = resolveMutationPath?.();
    if (!mutationPath) {
      return toolError(
        "NO_OPEN_DOCUMENT",
        "No open document for insert.",
        "Open a page, layout, or component in Composer.",
      );
    }

    let preflightedNode: unknown;
    try {
      preflightedNode = preflightBuilderNodeInput({
        kind: renderSurfaceKindForCollection(mutationPath.collection),
        node: parsed.data.node,
      }).source;
    } catch {
      return toolError("RENDER_INPUT_INVALID", "The render input is invalid.");
    }

    const normalized = normalizeDesignedSectionNode(preflightedNode);
    if (!normalized.ok) {
      return toolError(
        "INVALID_INPUT",
        "Invalid designed section node",
        formatDesignedSectionIssues(normalized.issues),
      );
    }

    const inserted = await executeInsertNodes({
      nodes: [normalized.node],
      parentId: parsed.data.parentId,
      insertPosition: parsed.data.insertPosition,
    });

    if (!inserted.ok) {
      return inserted;
    }

    return {
      ok: true,
      data: {
        inserted: inserted.data.inserted,
        nodeIds: inserted.data.nodeIds,
      },
    };
  }

  function executeSelectBlock(
    input: unknown,
  ): ClientToolResult<{ selected: string }> {
    const parsed = ClientToolSelectBlockInputSchema.safeParse(input);
    if (!parsed.success) {
      return toolError("INVALID_INPUT", "Invalid select_block payload");
    }

    if (!pageBlocks.value?.length) {
      return toolError("NO_OPEN_DOCUMENT", "No blocks available to select.");
    }

    const found = findNodeById(pageBlocks.value, parsed.data.blockId);
    if (!found) {
      return toolError("NOT_FOUND", `Block ${parsed.data.blockId} not found`);
    }

    illuminate(parsed.data.blockId);
    return { ok: true, data: { selected: parsed.data.blockId } };
  }

  async function executeUpdateNodeMotion(
    input: unknown,
  ): Promise<ClientToolResult<{ blockId: string; motion: NodeMotionValue }>> {
    const parsed = ClientToolUpdateNodeMotionInputSchema.safeParse(input);
    if (!parsed.success) {
      return toolError(
        "INVALID_INPUT",
        "Invalid update_node_motion payload",
        "Provide blockId if no block is selected, and motion matching aria_get_node_capabilities.",
      );
    }

    if (!executeNodeEventOperation || !resolveMutationPath) {
      return toolError(
        "NO_OPEN_DOCUMENT",
        "Composer is not open — cannot update motion.",
        "Open the target page, layout, or component in Composer first.",
      );
    }

    if (!resolveMutationPath()) {
      return toolError(
        "NO_OPEN_DOCUMENT",
        "No open document for motion update.",
        "Open a page, layout, or component in Composer.",
      );
    }

    const blockId = parsed.data.blockId ?? focusedNodeId.value;
    if (!blockId) {
      return toolError(
        "INVALID_INPUT",
        "No target block selected for motion.",
        "Select the hero block or provide blockId from the current document outline.",
      );
    }

    const existing = findNodeById(pageBlocks.value, blockId);
    if (!existing) {
      return toolError(
        "NOT_FOUND",
        `Block ${blockId} not found`,
        "Use the selected block/current document outline or select_block first.",
      );
    }

    const previousMotion = cloneMotion(existing.motion);
    const nextMotion = cloneMotion(parsed.data.motion) as NodeMotionValue;

    const applyMotion = (motion: BuilderNode["motion"] | undefined) => {
      pageBlocks.value = updateNodeById(pageBlocks.value, blockId, () => ({
        motion: cloneMotion(motion),
      }));
    };

    const result = await executeNodeEventOperation(
      {
        type: "update-node",
        description: `Agent update motion on ${existing.type}`,
        affectedNodeIds: [blockId],
      },
      {
        undo: () => applyMotion(previousMotion),
        redo: () => applyMotion(nextMotion),
      },
    );

    if (!result.success) {
      return toolError(
        "INTERNAL",
        result.error ?? "Failed to update node motion.",
      );
    }

    hasUnsavedChanges.value = true;
    return {
      ok: true,
      data: {
        blockId,
        motion: nextMotion,
      },
    };
  }

  function pickFontFile(): Promise<File | null> {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".woff2,.woff,.ttf,.otf,.eot,font/woff2,font/woff";
      input.onchange = () => {
        const file = input.files?.[0] ?? null;
        resolve(file);
      };
      input.click();
    });
  }

  async function executeUploadCustomFont(
    input: unknown,
  ): Promise<ClientToolResult<Record<string, unknown>>> {
    const parsed = ClientToolUploadCustomFontInputSchema.safeParse(input);
    if (!parsed.success) {
      return toolError(
        "INVALID_INPUT",
        "Invalid upload_custom_font payload",
        "Provide optional name, weight, and style.",
      );
    }

    if (
      !caps.isReady.value ||
      !user.value ||
      !hasEffectiveCapability(user.value, "editSiteSettings")
    ) {
      return toolError(
        "FORBIDDEN",
        "You cannot upload custom fonts.",
        caps.getForbiddenMessage("fonts.uploadCustom"),
      );
    }

    const file = await pickFontFile();
    if (!file) {
      return toolError(
        "INVALID_INPUT",
        "Font upload cancelled — no file selected.",
      );
    }

    const formData = new FormData();
    formData.append("file", file);
    if (parsed.data.name) formData.append("name", parsed.data.name);
    if (parsed.data.weight) formData.append("weight", parsed.data.weight);
    if (parsed.data.style) formData.append("style", parsed.data.style);

    const { data, error } = await actions.fonts.uploadCustom(formData);
    if (error || !data) {
      return toolError(
        "INTERNAL",
        error?.message ?? "Failed to upload custom font.",
      );
    }

    return { ok: true, data: data as Record<string, unknown> };
  }

  async function executeClientTool(
    toolName: string,
    input: unknown,
  ): Promise<ClientToolResult<unknown>> {
    switch (toolName) {
      case "open_in_composer":
        return executeOpenInComposer(input);
      case "insert_designed_section":
        return executeInsertDesignedSection(input);
      case "insert_nodes":
        return executeInsertNodes(input);
      case "select_block":
        return executeSelectBlock(input);
      case "update_node_motion":
        return executeUpdateNodeMotion(input);
      case "upload_custom_font":
        return executeUploadCustomFont(input);
      default:
        return toolError("INTERNAL", `Unknown client tool: ${toolName}`);
    }
  }

  return {
    executeOpenInComposer,
    executeInsertDesignedSection,
    executeInsertNodes,
    executeSelectBlock,
    executeUpdateNodeMotion,
    executeUploadCustomFont,
    executeClientTool,
    focusedNodeId,
  };
}
