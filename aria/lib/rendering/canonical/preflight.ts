import { RenderContractError, createRenderFailure } from "./errors";
import type { RenderSurfaceKind } from "./contract";

export const MAX_CANONICAL_SOURCE_BYTES = 2 * 1024 * 1024;
export const MAX_AUTHORED_NODE_COUNT = 5_000;
export const MAX_CONTAINER_DEPTH = 64;

type PreflightRootRole = "surface" | "node" | "node-array" | "value";
type TraversalRole = PreflightRootRole | "slot" | "slot-array";

export interface EditableSurfacePreflightResult {
  source: unknown;
  sourceBytes: number;
  authoredNodeCount: number;
  maximumContainerDepth: number;
}

type CloneContainer = Record<string, unknown> | unknown[];

type VisitFrame = {
  type: "visit";
  value: unknown;
  parent: CloneContainer | null;
  key: string | number | null;
  role: TraversalRole;
  parentContainerDepth: number;
};

type ExitFrame = {
  type: "exit";
  value: object;
};

type TraversalFrame = VisitFrame | ExitFrame;

const encoder = new TextEncoder();

function createPreflightError(
  surfaceKind: RenderSurfaceKind,
  issue: string,
  context: Record<string, string | number | boolean | null> = {},
): RenderContractError {
  return new RenderContractError(
    createRenderFailure("RENDER_INPUT_INVALID", {
      surfaceKind,
      stage: "preflight",
      issue,
      issueCount: 1,
      ...context,
    }),
  );
}

function serializedScalarByteLength(value: unknown): number {
  const serialized = JSON.stringify(value);
  return encoder.encode(serialized).byteLength;
}

function isArrayIndexKey(key: string, length: number): boolean {
  if (!/^(?:0|[1-9]\d*)$/u.test(key)) {
    return false;
  }
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length;
}

function childObjectRole(
  parentRole: TraversalRole,
  key: string,
): TraversalRole {
  if (parentRole === "surface") {
    if (key === "nodes") return "node-array";
    if (key === "slots") return "slot-array";
  }
  if (parentRole === "slot" && key === "defaultContent") {
    return "node-array";
  }
  if (parentRole === "node" && key === "children") {
    return "node-array";
  }
  return "value";
}

function childArrayRole(parentRole: TraversalRole): TraversalRole {
  if (parentRole === "node-array") return "node";
  if (parentRole === "slot-array") return "slot";
  return "value";
}

function assignCloneValue(
  parent: CloneContainer | null,
  key: string | number | null,
  value: unknown,
  setRoot: (root: unknown) => void,
): void {
  if (parent === null || key === null) {
    setRoot(value);
    return;
  }
  if (Array.isArray(parent)) {
    parent[key as number] = value;
    return;
  }
  Object.defineProperty(parent, key as string, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

function preflightJsonGraph(input: {
  surfaceKind: RenderSurfaceKind;
  source: unknown;
  rootRole: PreflightRootRole;
}): EditableSurfacePreflightResult {
  const activeAncestors = new WeakSet<object>();
  const stack: TraversalFrame[] = [
    {
      type: "visit",
      value: input.source,
      parent: null,
      key: null,
      role: input.rootRole,
      parentContainerDepth: 0,
    },
  ];

  let root: unknown;
  let sourceBytes = 0;
  let authoredNodeCount = 0;
  let maximumContainerDepth = 0;

  const addBytes = (amount: number): void => {
    sourceBytes += amount;
    if (sourceBytes > MAX_CANONICAL_SOURCE_BYTES) {
      throw createPreflightError(input.surfaceKind, "source-size", {
        violatedLimit: "canonicalSourceBytes",
        maximum: MAX_CANONICAL_SOURCE_BYTES,
        actual: sourceBytes,
      });
    }
  };

  while (stack.length > 0) {
    const frame = stack.pop();
    if (!frame) break;

    if (frame.type === "exit") {
      activeAncestors.delete(frame.value);
      continue;
    }

    if (frame.role === "node") {
      authoredNodeCount += 1;
      if (authoredNodeCount > MAX_AUTHORED_NODE_COUNT) {
        throw createPreflightError(input.surfaceKind, "node-count", {
          violatedLimit: "authoredNodeCount",
          maximum: MAX_AUTHORED_NODE_COUNT,
          actual: authoredNodeCount,
        });
      }
    }

    const value = frame.value;
    if (value === null) {
      addBytes(4);
      assignCloneValue(frame.parent, frame.key, null, (next) => {
        root = next;
      });
      continue;
    }

    if (typeof value === "string") {
      addBytes(serializedScalarByteLength(value));
      assignCloneValue(frame.parent, frame.key, value, (next) => {
        root = next;
      });
      continue;
    }

    if (typeof value === "boolean") {
      addBytes(value ? 4 : 5);
      assignCloneValue(frame.parent, frame.key, value, (next) => {
        root = next;
      });
      continue;
    }

    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        throw createPreflightError(input.surfaceKind, "non-finite-number");
      }
      const normalizedNumber = Object.is(value, -0) ? 0 : value;
      addBytes(serializedScalarByteLength(normalizedNumber));
      assignCloneValue(frame.parent, frame.key, normalizedNumber, (next) => {
        root = next;
      });
      continue;
    }

    if (typeof value !== "object") {
      throw createPreflightError(
        input.surfaceKind,
        value === undefined ? "undefined-value" : `unsupported-${typeof value}`,
      );
    }

    if (activeAncestors.has(value)) {
      throw createPreflightError(input.surfaceKind, "cycle");
    }

    const containerDepth = frame.parentContainerDepth + 1;
    maximumContainerDepth = Math.max(maximumContainerDepth, containerDepth);
    if (containerDepth > MAX_CONTAINER_DEPTH) {
      throw createPreflightError(input.surfaceKind, "container-depth", {
        violatedLimit: "containerDepth",
        maximum: MAX_CONTAINER_DEPTH,
        actual: containerDepth,
      });
    }

    activeAncestors.add(value);
    stack.push({ type: "exit", value });

    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        throw createPreflightError(input.surfaceKind, "custom-array-prototype");
      }

      for (const ownKey of Reflect.ownKeys(value)) {
        if (typeof ownKey === "symbol") {
          throw createPreflightError(input.surfaceKind, "symbol-key");
        }
        if (ownKey === "length") continue;
        if (!isArrayIndexKey(ownKey, value.length)) {
          throw createPreflightError(input.surfaceKind, "array-extra-property");
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, ownKey);
        if (!descriptor || "get" in descriptor || "set" in descriptor) {
          throw createPreflightError(input.surfaceKind, "accessor");
        }
      }

      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          throw createPreflightError(input.surfaceKind, "sparse-array");
        }
        const descriptor = Object.getOwnPropertyDescriptor(
          value,
          String(index),
        );
        if (!descriptor || "get" in descriptor || "set" in descriptor) {
          throw createPreflightError(input.surfaceKind, "accessor");
        }
        if (descriptor.value === undefined) {
          throw createPreflightError(
            input.surfaceKind,
            "undefined-array-entry",
          );
        }
      }

      const clone: unknown[] = new Array(value.length);
      assignCloneValue(frame.parent, frame.key, clone, (next) => {
        root = next;
      });
      addBytes(2 + Math.max(0, value.length - 1));

      const elementRole = childArrayRole(frame.role);
      for (let index = value.length - 1; index >= 0; index -= 1) {
        stack.push({
          type: "visit",
          value: value[index],
          parent: clone,
          key: index,
          role: elementRole,
          parentContainerDepth: containerDepth,
        });
      }
      continue;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw createPreflightError(input.surfaceKind, "custom-object-prototype");
    }

    const entries: Array<[string, unknown]> = [];
    for (const ownKey of Reflect.ownKeys(value)) {
      if (typeof ownKey === "symbol") {
        throw createPreflightError(input.surfaceKind, "symbol-key");
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, ownKey);
      if (!descriptor || "get" in descriptor || "set" in descriptor) {
        throw createPreflightError(input.surfaceKind, "accessor");
      }
      if (!descriptor.enumerable) {
        throw createPreflightError(
          input.surfaceKind,
          "non-enumerable-property",
        );
      }
      if (descriptor.value !== undefined) {
        entries.push([ownKey, descriptor.value]);
      }
    }

    const clone = Object.create(null) as Record<string, unknown>;
    assignCloneValue(frame.parent, frame.key, clone, (next) => {
      root = next;
    });
    addBytes(2 + Math.max(0, entries.length - 1));
    for (const [key] of entries) {
      addBytes(serializedScalarByteLength(key) + 1);
    }

    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      if (!entry) continue;
      const [key, childValue] = entry;
      stack.push({
        type: "visit",
        value: childValue,
        parent: clone,
        key,
        role: childObjectRole(frame.role, key),
        parentContainerDepth: containerDepth,
      });
    }
  }

  return {
    source: root,
    sourceBytes,
    authoredNodeCount,
    maximumContainerDepth,
  };
}

export function preflightEditableSurface(input: {
  kind: RenderSurfaceKind;
  source: unknown;
}): EditableSurfacePreflightResult {
  return preflightJsonGraph({
    surfaceKind: input.kind,
    source: input.source,
    rootRole: "surface",
  });
}

export function preflightBuilderNodeInput(input: {
  kind: RenderSurfaceKind;
  node: unknown;
}): EditableSurfacePreflightResult {
  return preflightJsonGraph({
    surfaceKind: input.kind,
    source: input.node,
    rootRole: "node",
  });
}

export function preflightBuilderNodeArrayInput(input: {
  kind: RenderSurfaceKind;
  nodes: unknown;
}): EditableSurfacePreflightResult {
  return preflightJsonGraph({
    surfaceKind: input.kind,
    source: input.nodes,
    rootRole: "node-array",
  });
}
