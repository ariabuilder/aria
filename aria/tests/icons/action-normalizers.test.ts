import { describe, expect, it } from "vitest";
import {
  normalizeIconSettingsInput,
  normalizeNodeIcons,
  normalizeNodesIcons,
} from "../../lib/icons/action-normalizers";
import type { BuilderNode } from "../../lib/types/nodes";

function createNode(overrides: Partial<BuilderNode>): BuilderNode {
  return {
    id: overrides.id ?? "node",
    type: overrides.type ?? "icon",
    props: overrides.props ?? {},
    styles: overrides.styles ?? {},
    children: overrides.children ?? [],
    ...overrides,
  };
}

describe("icon action normalizers", () => {
  describe("normalizeIconSettingsInput", () => {
    it("fills defaults and enforces default pack", () => {
      const normalized = normalizeIconSettingsInput({
        enabledPacks: { lucide: true, "coreui-brands": false },
        defaultPack: "lucide",
      });

      expect(normalized.defaultPack).toBe("lucide");
      expect(normalized.enabledPacks.lucide).toBe(true);
      expect(normalized.enabledPacks["coreui-brands"]).toBe(false);
    });

    it("allows brand-only packs when all icon packs are disabled", () => {
      const normalized = normalizeIconSettingsInput({
        enabledPacks: {
          lucide: false,
          "coreui-brands": true,
        },
        defaultPack: "coreui-brands",
      });

      expect(normalized.defaultPack).toBe("coreui-brands");
      expect(normalized.enabledPacks.lucide).toBe(false);
      expect(normalized.enabledPacks["coreui-brands"]).toBe(true);
    });

    it("rejects disabled default pack", () => {
      expect(() =>
        normalizeIconSettingsInput({
          enabledPacks: {
            lucide: false,
            "coreui-brands": true,
          },
          defaultPack: "lucide",
        }),
      ).toThrow("Default icon pack must be enabled");
    });
  });

  describe("normalizeNodeIcons", () => {
    it("normalizes legacy class string icon to canonical object", () => {
      const input = createNode({
        id: "node-1",
        type: "icon",
        props: {
          icon: "i-lucide:star",
        },
      });

      const normalized = normalizeNodeIcons(input);
      const icon = (normalized.props as Record<string, unknown>).icon as Record<
        string,
        unknown
      >;

      expect(icon.id).toBe("lucide:star");
      expect(icon.pack).toBe("lucide");
      expect(icon.name).toBe("star");
    });

    it("normalizes icon recursively for children", () => {
      const input = createNode({
        id: "parent",
        type: "container",
        children: [
          createNode({
            id: "child-1",
            type: "icon",
            props: {
              icon: "i-lucide:camera",
            },
          }),
        ],
      });

      const normalized = normalizeNodeIcons(input);
      const child = normalized.children?.[0] as BuilderNode;
      const childIcon = (child.props as Record<string, unknown>).icon as Record<
        string,
        unknown
      >;

      expect(childIcon.id).toBe("lucide:camera");
      expect(childIcon.pack).toBe("lucide");
    });

    it("throws on invalid icon payload shape", () => {
      const input = createNode({
        id: "invalid-node",
        type: "icon",
        props: {
          icon: {
            id: "bad-id",
            pack: "lucide",
          },
        },
      });

      expect(() => normalizeNodeIcons(input)).toThrow(
        "Invalid icon payload for node invalid-node",
      );
    });
  });

  describe("normalizeNodesIcons", () => {
    it("normalizes all nodes in an array", () => {
      const input: BuilderNode[] = [
        createNode({
          id: "a",
          type: "icon",
          props: { icon: "i-lucide:star" },
        }),
        createNode({
          id: "b",
          type: "icon",
          props: { icon: "i-lucide:brain" },
        }),
      ];

      const normalized = normalizeNodesIcons(input);
      const iconA = (normalized[0].props as Record<string, unknown>)
        .icon as Record<string, unknown>;
      const iconB = (normalized[1].props as Record<string, unknown>)
        .icon as Record<string, unknown>;

      expect(iconA.id).toBe("lucide:star");
      expect(iconB.id).toBe("lucide:brain");
    });
  });
});
