import { computed, inject, type Ref } from "vue";
import type { BuilderNode } from "../../../../lib/types/nodes";
import { PaginationNodePropsSchema } from "../../../../lib/cms/resolvePagination";
import {
  collectPaginationListContainers,
  resolvePaginationInheritedLimit,
} from "../../../../lib/cms/paginationInspector";
import { APP_INJECTION_KEYS } from "../../Core/types/injectionKeys";
import { useSelectedNodeState } from "../../Core/composables/useSelectedNodeState";
import { useInspector } from "./useInspector";

export function usePaginationInspector() {
  const pageBlocks = inject(
    APP_INJECTION_KEYS.pageBlocks,
    null,
  ) as Ref<BuilderNode[]> | null;
  const { selectedNode } = useSelectedNodeState();
  const inspector = useInspector();

  const isPaginationNode = computed(() => {
    const type = selectedNode.value?.type?.toLowerCase();
    return type === "pagination";
  });

  const listContainerOptions = computed(() =>
    collectPaginationListContainers(pageBlocks?.value ?? []),
  );

  const connectedTargetId = computed(
    () =>
      selectedNode.value?.dataSource?.type === "pagination"
        ? selectedNode.value.dataSource.targetNodeId
        : undefined,
  );

  const inheritedLimit = computed(() =>
    resolvePaginationInheritedLimit(
      pageBlocks?.value ?? [],
      connectedTargetId.value,
    ),
  );

  const paginationProps = computed(() => {
    const parsed = PaginationNodePropsSchema.safeParse(selectedNode.value?.props ?? {});
    return parsed.success ? parsed.data : PaginationNodePropsSchema.parse({});
  });

  const connectionLabel = computed(() => {
    if (!connectedTargetId.value) {
      return "Connect to a list";
    }
    const match = listContainerOptions.value.find(
      (option) => option.id === connectedTargetId.value,
    );
    return match?.label ?? connectedTargetId.value;
  });

  async function connectToList(targetNodeId: string): Promise<void> {
    await inspector.updateProperty(
      "dataSource",
      {
        type: "pagination",
        targetNodeId,
      },
      { description: "Connect pagination to list" },
    );
  }

  async function updatePaginationProp(
    key: keyof ReturnType<typeof PaginationNodePropsSchema.parse>,
    value: unknown,
  ): Promise<void> {
    await inspector.updateProperty(`props.${String(key)}`, value, {
      description: `Update pagination ${String(key)}`,
    });
  }

  return {
    isPaginationNode,
    listContainerOptions,
    connectedTargetId,
    inheritedLimit,
    paginationProps,
    connectionLabel,
    connectToList,
    updatePaginationProp,
  };
}
