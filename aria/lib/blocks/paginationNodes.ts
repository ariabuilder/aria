import { generateNodeId } from "../ids/nodeId";
import type { BuilderNode } from "../types/nodes";

export function createPaginationNode(options?: {
  targetNodeId?: string;
}): BuilderNode {
  return {
    id: generateNodeId(),
    type: "Pagination",
    props: {
      style: "numbers",
      maxPageButtons: 5,
      pageParam: "page",
      labels: {
        prev: "Previous",
        next: "Next",
      },
    },
    styles: {},
    children: [],
    dataSource: options?.targetNodeId
      ? {
          type: "pagination",
          targetNodeId: options.targetNodeId,
        }
      : undefined,
  };
}
