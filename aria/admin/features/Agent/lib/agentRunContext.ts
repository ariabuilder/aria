import type { AgentShellContext } from "./schemas";

export interface AgentRunDocumentIdentity {
  type: "page" | "layout" | "component";
  id: string;
}

const DOCUMENT_BOUND_CLIENT_TOOLS = new Set([
  "insert_designed_section",
  "insert_nodes",
  "select_block",
  "update_node_motion",
]);

export function resolveAgentRunDocumentIdentity(
  context: AgentShellContext,
): AgentRunDocumentIdentity | null {
  // The route target updates before the loaded document refs during Composer
  // navigation, so prefer it as the stable run identity when available.
  if (context.itemType && context.itemSlug) {
    return { type: context.itemType, id: context.itemSlug };
  }
  if (context.currentDocument) {
    return {
      type: context.currentDocument.type,
      id: context.currentDocument.id,
    };
  }
  return null;
}

export function isAgentRunDocumentCurrent(
  expected: AgentRunDocumentIdentity | null,
  current: AgentShellContext,
): boolean {
  if (!expected) return true;
  const actual = resolveAgentRunDocumentIdentity(current);
  return actual?.type === expected.type && actual.id === expected.id;
}

export function isDocumentBoundClientTool(toolName: string): boolean {
  return DOCUMENT_BOUND_CLIENT_TOOLS.has(toolName);
}

export function anchorClientToolInputToRunSelection(
  toolName: string,
  input: unknown,
  selectedBlockId: string | null,
): unknown {
  if (
    toolName !== "update_node_motion" ||
    !selectedBlockId ||
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    "blockId" in input
  ) {
    return input;
  }

  return { ...input, blockId: selectedBlockId };
}
