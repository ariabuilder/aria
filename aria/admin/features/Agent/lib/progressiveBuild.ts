export interface ProgressiveSectionInsertionGate {
  shouldDefer: (toolName: string, input?: unknown) => boolean;
  recordResult: (
    toolName: string,
    succeeded: boolean,
    input?: unknown,
  ) => void;
}

export async function executeClientToolCallOnce<T>(
  resultsByCallId: Map<string, T>,
  toolCallId: string,
  execute: () => Promise<T>,
): Promise<T> {
  const previous = resultsByCallId.get(toolCallId);
  if (previous !== undefined) return previous;

  const result = await execute();
  resultsByCallId.set(toolCallId, result);
  return result;
}

function isRootSectionNode(node: unknown): boolean {
  if (!node || typeof node !== "object" || !("type" in node)) return false;
  const type = (node as { type?: unknown }).type;
  return typeof type === "string" && type.toLowerCase() === "section";
}

export function isProgressiveSectionInsertTool(
  toolName: string,
  input?: unknown,
): boolean {
  if (toolName === "insert_designed_section") return true;
  if (
    toolName !== "insert_nodes" ||
    !input ||
    typeof input !== "object" ||
    !("nodes" in input)
  ) {
    return false;
  }

  const nodes = (input as { nodes?: unknown }).nodes;
  if (!Array.isArray(nodes) || nodes.length !== 1) return false;
  return isRootSectionNode(nodes[0]);
}

export function hasBatchedRootSectionInsertions(
  toolName: string,
  input: unknown,
): boolean {
  if (
    toolName !== "insert_nodes" ||
    !input ||
    typeof input !== "object" ||
    !("nodes" in input)
  ) {
    return false;
  }
  const nodes = (input as { nodes?: unknown }).nodes;
  if (!Array.isArray(nodes) || nodes.length <= 1) return false;
  return nodes.some(isRootSectionNode);
}

/** Enforces at most one successful real section insertion per continuation. */
export function createProgressiveSectionInsertionGate(): ProgressiveSectionInsertionGate {
  let insertedSection = false;

  return {
    shouldDefer(toolName, input) {
      return (
        isProgressiveSectionInsertTool(toolName, input) && insertedSection
      );
    },
    recordResult(toolName, succeeded, input) {
      if (isProgressiveSectionInsertTool(toolName, input) && succeeded) {
        insertedSection = true;
      }
    },
  };
}

export function buildDeferredSectionInsertionResult() {
  return {
    ok: true as const,
    data: {
      deferred: true as const,
      inserted: 0,
      message:
        "A section was already inserted in this step. Add this section again in the next step.",
    },
  };
}

export function isDeferredSectionInsertionResult(result: unknown): boolean {
  if (!result || typeof result !== "object" || !("ok" in result)) {
    return false;
  }
  if ((result as { ok?: unknown }).ok !== true || !("data" in result)) {
    return false;
  }
  const data = (result as { data?: unknown }).data;
  if (!data || typeof data !== "object") return false;
  return (
    "deferred" in data &&
    (data as { deferred?: unknown }).deferred === true
  );
}
