import { z } from "zod";
import type { BuilderNode } from "../types/nodes";
import {
  IconPropInputSchema,
  normalizeIconValue,
  type IconPackKey,
} from "./reference";

export interface IconEnabledPacks {
  lucide: boolean;
  "coreui-brands": boolean;
}

export interface NormalizedIconSettingsInput {
  enabledPacks: IconEnabledPacks;
  defaultPack: IconPackKey | "none";
}

const IconSettingsInputSchema = z.object({
  enabledPacks: z
    .object({
      lucide: z.boolean().optional(),
      "coreui-brands": z.boolean().optional(),
    })
    .optional(),
  defaultPack: z.enum(["lucide", "coreui-brands", "none"]).optional(),
});

export function normalizeIconSettingsInput(
  input: unknown,
): NormalizedIconSettingsInput {
  const parsed = IconSettingsInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("Invalid icon settings payload");
  }

  const enabledPacks: IconEnabledPacks = {
    lucide: parsed.data.enabledPacks?.lucide ?? false,
    "coreui-brands": parsed.data.enabledPacks?.["coreui-brands"] ?? false,
  };

  const defaultPack = parsed.data.defaultPack ?? "none";
  if (
    defaultPack !== "none" &&
    !enabledPacks[defaultPack as keyof IconEnabledPacks]
  ) {
    throw new Error("Default icon pack must be enabled");
  }

  return {
    enabledPacks,
    defaultPack,
  };
}

function normalizeNodeIconValue(node: BuilderNode): BuilderNode {
  const normalizedNode: BuilderNode = {
    ...node,
  };

  if (normalizedNode.props && "icon" in normalizedNode.props) {
    const iconValue = (normalizedNode.props as Record<string, unknown>).icon;

    if (iconValue !== undefined) {
      const parsed = IconPropInputSchema.safeParse(iconValue);
      if (!parsed.success) {
        throw new Error(`Invalid icon payload for node ${normalizedNode.id}`);
      }

      (normalizedNode.props as Record<string, unknown>).icon =
        normalizeIconValue(parsed.data);
    }
  }

  if (Array.isArray(normalizedNode.children)) {
    normalizedNode.children = normalizedNode.children.map((child) =>
      normalizeNodeIconValue(child as BuilderNode),
    );
  }

  return normalizedNode;
}

export function normalizeNodeIcons(node: BuilderNode): BuilderNode {
  return normalizeNodeIconValue(node);
}

export function normalizeNodesIcons(
  nodes: readonly BuilderNode[],
): BuilderNode[] {
  return nodes.map((node) => normalizeNodeIconValue(node));
}
