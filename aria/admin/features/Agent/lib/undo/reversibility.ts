import type { ServerToolName } from "../tools/constants";

/**
 * Tools for which executeTool durably captures the complete pre-mutation
 * document and can restore it with an optimistic concurrency check.
 */
export const EXACT_UNDO_SERVER_TOOL_NAMES = [
  "aria_save_document",
  "aria_insert_nodes",
  "aria_mutate_node",
  "aria_update_node_motion",
  "aria_move_node",
  "aria_delete_node",
  "aria_update_node_classes",
  "aria_replace_node",
  "aria_update_layout_slots",
  "aria_attach_media_to_node",
] as const satisfies readonly ServerToolName[];

const EXACT_UNDO_TOOL_SET = new Set<ServerToolName>(
  EXACT_UNDO_SERVER_TOOL_NAMES,
);

export function supportsExactAgentUndo(toolName: ServerToolName): boolean {
  return EXACT_UNDO_TOOL_SET.has(toolName);
}
