/**
 * Tests the useSchemaRules composable for node schema validation.
 */

import { describe, it, expect } from "vitest";
import type { BuilderNode, JsonObject } from "../../../lib/types/nodes";
import { useSchemaRules } from "../../../admin/features/Layers/composables/useSchemaRules";

describe("useSchemaRules", () => {
  const createNode = (
    id: string,
    type: string,
    props: JsonObject = {},
    children: BuilderNode[] = [],
  ): BuilderNode => ({
    id,
    type,
    props,
    styles: {},
    children,
  });

  describe("getRequirements", () => {
    const { getRequirements } = useSchemaRules();

    it("should return requirements for defined types", () => {
      const req = getRequirements("Image");
      expect(req).not.toBeNull();
      expect(req?.required).toContain("src");
      expect(req?.required).toContain("alt");
    });

    it("should return requirements for Link", () => {
      const req = getRequirements("Link");
      expect(req).not.toBeNull();
      expect(req?.required).toContain("href");
    });

    it("should return null for undefined types", () => {
      const req = getRequirements("CustomType");
      expect(req).toBeNull();
    });
  });

  describe("canHaveChildren", () => {
    const { canHaveChildren } = useSchemaRules();

    it("should return true for Container type", () => {
      expect(canHaveChildren("Container")).toBe(true);
    });

    it("should return true for Section type", () => {
      expect(canHaveChildren("Section")).toBe(true);
    });

    it("should return true for legacy container aliases", () => {
      expect(canHaveChildren("Div")).toBe(true);
      expect(canHaveChildren("Block")).toBe(true);
    });

    it("should return false for Image type", () => {
      expect(canHaveChildren("Image")).toBe(false);
    });

    it("should return false for Text type", () => {
      expect(canHaveChildren("Text")).toBe(false);
    });

    it("should return true for unknown types", () => {
      // Unknown types default to true (can have children)
      expect(canHaveChildren("CustomType")).toBe(true);
    });

    it("should return false for types with allowChildren: false", () => {
      expect(canHaveChildren("Button")).toBe(false);
    });
  });

  describe("validateProp", () => {
    const { validateProp } = useSchemaRules();

    it("should pass for valid required prop", () => {
      const node = createNode("1", "Image", { src: "/test.jpg", alt: "Test" });
      const result = validateProp(node, "src");
      expect(result.valid).toBe(true);
    });

    it("should fail for missing required prop", () => {
      const node = createNode("1", "Image", { alt: "Test" });
      const result = validateProp(node, "src");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("src");
      expect(result.suggestion).toContain("src");
    });

    it("should fail for wrong prop type", () => {
      const node = createNode("1", "Link", { href: 123 });
      const result = validateProp(node, "href");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("string");
    });

    it("should pass for optional prop when not set", () => {
      const node = createNode("1", "Image", { src: "/test.jpg", alt: "Test" });
      const result = validateProp(node, "width");
      expect(result.valid).toBe(true);
    });

    it("should return true for types without schema", () => {
      const node = createNode("1", "CustomType", { customProp: "value" });
      const result = validateProp(node, "customProp");
      expect(result.valid).toBe(true);
    });
  });

  describe("validateNodeSchema", () => {
    const { validateNodeSchema } = useSchemaRules();

    it("should return empty array for valid node", () => {
      const node = createNode("1", "Image", { src: "/test.jpg", alt: "Test" });
      const errors = validateNodeSchema(node);
      expect(errors).toEqual([]);
    });

    it("should find missing required props", () => {
      const node = createNode("1", "Image", { alt: "Test" }); // Missing src
      const errors = validateNodeSchema(node);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].field).toBe("src");
      expect(errors[0].severity).toBe("error");
    });

    it("should find multiple missing props", () => {
      const node = createNode("1", "Image", {}); // Missing both src and alt
      const errors = validateNodeSchema(node);

      expect(errors.length).toBe(2);
    });

    it("should return empty for types without schema", () => {
      const node = createNode("1", "CustomType", { custom: "value" });
      const errors = validateNodeSchema(node);
      expect(errors).toEqual([]);
    });

    it("should detect children in leaf type", () => {
      const node = createNode(
        "1",
        "Image",
        { src: "/test.jpg", alt: "Test" },
        [createNode("2", "Text")], // Image shouldn't have children
      );
      const errors = validateNodeSchema(node);

      expect(errors.length).toBe(1);
      expect(errors[0].code).toBe("TARGET_NO_CHILDREN");
    });
  });

  describe("getMissingRequiredProps", () => {
    const { getMissingRequiredProps } = useSchemaRules();

    it("should return empty for complete props", () => {
      const node = createNode("1", "Image", { src: "/test.jpg", alt: "Test" });
      const missing = getMissingRequiredProps(node);
      expect(missing).toEqual([]);
    });

    it("should return missing prop names", () => {
      const node = createNode("1", "Image", { alt: "Test" });
      const missing = getMissingRequiredProps(node);
      expect(missing).toContain("src");
    });

    it("should return all missing props", () => {
      const node = createNode("1", "Image", {});
      const missing = getMissingRequiredProps(node);
      expect(missing.length).toBe(2);
    });

    it("should return empty for types without requirements", () => {
      const node = createNode("1", "CustomType", {});
      const missing = getMissingRequiredProps(node);
      expect(missing).toEqual([]);
    });
  });

  describe("isNodeSchemaValid", () => {
    const { isNodeSchemaValid } = useSchemaRules();

    it("should return true for valid node", () => {
      const node = createNode("1", "Image", { src: "/test.jpg", alt: "Test" });
      expect(isNodeSchemaValid(node)).toBe(true);
    });

    it("should return false for invalid node", () => {
      const node = createNode("1", "Image", {}); // Missing required props
      expect(isNodeSchemaValid(node)).toBe(false);
    });

    it("should return true for types without schema", () => {
      const node = createNode("1", "CustomType", {});
      expect(isNodeSchemaValid(node)).toBe(true);
    });
  });

  describe("getAllowedProps", () => {
    const { getAllowedProps } = useSchemaRules();

    it("should return all allowed props for Image", () => {
      const props = getAllowedProps("Image");
      expect(props).toContain("src");
      expect(props).toContain("alt");
      expect(props).toContain("width");
      expect(props).toContain("height");
    });

    it("should return empty array for unknown types", () => {
      const props = getAllowedProps("UnknownType");
      expect(props).toEqual([]);
    });
  });

  describe("getRequiredProps", () => {
    const { getRequiredProps } = useSchemaRules();

    it("should return required props for Image", () => {
      const props = getRequiredProps("Image");
      expect(props).toEqual(["src", "alt"]);
    });

    it("should return required props for Link", () => {
      const props = getRequiredProps("Link");
      expect(props).toEqual(["href"]);
    });

    it("should return empty array for types without requirements", () => {
      const props = getRequiredProps("Container");
      expect(props).toEqual([]);
    });
  });

  describe("checkDuplicateIds", () => {
    const { checkDuplicateIds } = useSchemaRules();

    it("should return empty for no duplicates", () => {
      const tree = [createNode("1", "Container"), createNode("2", "Text")];
      const duplicates = checkDuplicateIds(tree);
      expect(duplicates).toEqual([]);
    });

    it("should find duplicate IDs", () => {
      const tree = [
        createNode("1", "Container"),
        createNode("2", "Text"),
        createNode("1", "Heading"), // Duplicate
      ];
      const duplicates = checkDuplicateIds(tree);
      expect(duplicates).toEqual(["1"]);
    });

    it("should find multiple duplicate IDs", () => {
      const tree = [
        createNode("a", "Container"),
        createNode("b", "Text"),
        createNode("a", "Heading"),
        createNode("b", "Image"),
      ];
      const duplicates = checkDuplicateIds(tree);
      expect(duplicates).toContain("a");
      expect(duplicates).toContain("b");
    });

    it("should check nested nodes", () => {
      const tree = [
        createNode("1", "Container", {}, [
          createNode("2", "Text"),
          createNode("3", "Heading"),
          createNode("2", "Container"), // Duplicate
        ]),
      ];
      const duplicates = checkDuplicateIds(tree);
      expect(duplicates).toContain("2");
    });
  });

  describe("checkTreeDepth", () => {
    const { checkTreeDepth } = useSchemaRules();

    it("should return empty for shallow tree", () => {
      const tree = [
        createNode("1", "Container", {}, [createNode("2", "Text")]),
      ];
      const errors = checkTreeDepth(tree, 10);
      expect(errors).toEqual([]);
    });

    it("should find nodes exceeding max depth", () => {
      let node: BuilderNode = createNode("leaf", "Text");
      for (let i = 1; i <= 5; i++) {
        node = createNode(`level-${i}`, "Container", {}, [node]);
      }
      const tree = [node];

      const errors = checkTreeDepth(tree, 3);
      // Should report the first node that exceeds depth (stops traversing that branch)
      expect(errors.length).toBe(1);
      expect(errors[0].nodeId).toBe("level-2");
    });

    it("should use default max depth of 100", () => {
      const { checkTreeDepth } = useSchemaRules();
      let node: BuilderNode = createNode("leaf", "Text");
      for (let i = 1; i <= 50; i++) {
        node = createNode(`level-${i}`, "Container", {}, [node]);
      }
      const tree = [node];

      const errors = checkTreeDepth(tree);
      expect(errors.length).toBe(0);
    });

    it("should not traverse deeper after max depth", () => {
      let node: BuilderNode = createNode("leaf", "Text");
      for (let i = 1; i <= 10; i++) {
        node = createNode(`level-${i}`, "Container", {}, [node]);
      }
      const tree = [node];

      const errors = checkTreeDepth(tree, 3);
      // Should only report the first node that exceeds depth
      expect(errors.length).toBeGreaterThan(0);
      // Each error should be at a specific depth
      errors.forEach((error) => {
        expect(error.severity).toBe("warning");
      });
    });
  });
});
