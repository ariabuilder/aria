import { ActionError } from "astro:actions";
import type { SessionUser } from "../auth/types";
import { hasEffectiveCapability } from "../auth/hasEffectiveCapability";
import type { BuilderNode } from "../types/nodes";

const UNSAFE_SVG_PATTERN =
  /<\s*(?:script|foreignObject|iframe|object|embed)\b|\bon[a-z]+\s*=|(?:javascript|vbscript)\s*:|data\s*:\s*text\/html/i;

function executableSignature(node: BuilderNode): string | null {
  const type = node.type.toLowerCase();
  const props = node.props ?? {};

  if (type === "code" && props.renderMode === "render") {
    return JSON.stringify({
      type,
      renderMode: "render",
      content: props.content ?? props.code ?? props.text ?? "",
    });
  }

  if (type === "svg") {
    const content = typeof props.content === "string" ? props.content : "";
    if (UNSAFE_SVG_PATTERN.test(content)) {
      return JSON.stringify({ type, content });
    }
  }

  return null;
}

function collectExecutableNodes(
  nodes: readonly BuilderNode[],
): Map<string, string> {
  const found = new Map<string, string>();
  const walk = (node: BuilderNode): void => {
    const signature = executableSignature(node);
    if (signature !== null) found.set(node.id, signature);
    for (const child of node.children ?? []) walk(child);
  };
  for (const node of nodes) walk(node);
  return found;
}

export function introducesExecutableContent(
  previousNodes: readonly BuilderNode[],
  nextNodes: readonly BuilderNode[],
  previousHeadHtml?: unknown,
  nextHeadHtml?: unknown,
): boolean {
  const previous = collectExecutableNodes(previousNodes);
  const next = collectExecutableNodes(nextNodes);
  for (const [id, signature] of next) {
    if (previous.get(id) !== signature) return true;
  }

  const previousHead =
    typeof previousHeadHtml === "string" ? previousHeadHtml : "";
  const nextHead = typeof nextHeadHtml === "string" ? nextHeadHtml : "";
  return nextHead !== previousHead && nextHead.trim().length > 0;
}

export function assertExecutableContentChangeAllowed(input: {
  user: SessionUser | null | undefined;
  previousNodes?: readonly BuilderNode[];
  nextNodes?: readonly BuilderNode[];
  previousHeadHtml?: unknown;
  nextHeadHtml?: unknown;
}): void {
  if (
    !introducesExecutableContent(
      input.previousNodes ?? [],
      input.nextNodes ?? [],
      input.previousHeadHtml,
      input.nextHeadHtml,
    )
  ) {
    return;
  }

  if (input.user && hasEffectiveCapability(input.user, "editCustomCode")) {
    return;
  }

  throw new ActionError({
    code: "FORBIDDEN",
    message:
      "Requires editCustomCode capability to add or change executable content",
  });
}
