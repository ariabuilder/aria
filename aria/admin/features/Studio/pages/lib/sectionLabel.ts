import { z } from "zod";
import type { BuilderNode } from "../../../../../lib/types/nodes";

export const SectionLabelSchema = z.string().trim().min(1).max(100);

export function parseSectionLabel(
  value: string,
): { success: true; data: string } | { success: false } {
  const parsed = SectionLabelSchema.safeParse(value);
  if (!parsed.success) {
    return { success: false };
  }
  return { success: true, data: parsed.data };
}

export function getSectionDisplayLabel(node: BuilderNode): string {
  return node.metadata?.label ?? node.type;
}

export function applySectionLabel(
  nodes: BuilderNode[],
  sectionId: string,
  label: string,
): BuilderNode[] | null {
  const parsed = parseSectionLabel(label);
  if (!parsed.success) {
    return null;
  }

  const index = nodes.findIndex((node) => node.id === sectionId);
  if (index < 0) {
    return null;
  }

  const target = nodes[index];
  if (!target) {
    return null;
  }

  const currentLabel = getSectionDisplayLabel(target);
  if (parsed.data === currentLabel) {
    return null;
  }

  return nodes.map((node) => {
    if (node.id !== sectionId) {
      return node;
    }

    return {
      ...node,
      metadata: {
        ...(node.metadata ?? {}),
        label: parsed.data,
      },
    };
  });
}
