import type { BuilderNode } from "../types/nodes";

export const GENERATED_NODE_ID_PREFIX = "n_" as const;
export const GENERATED_NODE_ID_ALPHABET =
  "abcdefghijklmnopqrstuvwxyz0123456789" as const;
export const GENERATED_NODE_ID_RANDOM_LENGTH = 8 as const;

export const NODE_ID_ALLOWED_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
export const GENERATED_NODE_ID_PATTERN = new RegExp(
  `^${GENERATED_NODE_ID_PREFIX}[a-z0-9]{${GENERATED_NODE_ID_RANDOM_LENGTH}}$`,
);

export type GeneratedNodeId = `${typeof GENERATED_NODE_ID_PREFIX}${string}`;

export function generateNodeId(): GeneratedNodeId {
  const bytes = new Uint8Array(GENERATED_NODE_ID_RANDOM_LENGTH);
  crypto.getRandomValues(bytes);

  let value = GENERATED_NODE_ID_PREFIX;

  for (const byte of bytes) {
    value +=
      GENERATED_NODE_ID_ALPHABET[byte % GENERATED_NODE_ID_ALPHABET.length];
  }

  if (!GENERATED_NODE_ID_PATTERN.test(value)) {
    throw new Error("Failed to generate a valid node ID");
  }

  return value as GeneratedNodeId;
}

export function regenerateNodeTreeIds(node: BuilderNode): BuilderNode {
  const nextProps = { ...(node.props ?? {}) };
  delete nextProps.id;

  return {
    ...node,
    id: generateNodeId(),
    props: nextProps,
    children: node.children?.map((child) => regenerateNodeTreeIds(child)) ?? [],
  };
}
