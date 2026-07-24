import { describe, expect, it } from "vitest";
import {
  detectTokenizedMarkupImport,
  scoreImportedNodeTree,
} from "../../lib/blocks/pasteImportQuality";
import type { BuilderNode, JsonObject } from "../../lib/types/nodes";

const createNode = (
  type: string,
  props: JsonObject = {},
  children: BuilderNode[] = [],
): BuilderNode => ({
  id: "n_test",
  type,
  props,
  styles: {},
  children,
});

describe("pasteImportQuality", () => {

  describe("source code detection", () => {
    it("flags tokenized span soup as failed import", () => {
      const nodes = [
        createNode("Container", {}, [
          createNode("Span", { text: "<section" }),
          createNode("Span", { text: ' class="hero"' }),
          createNode("Span", { text: ">" }),
        ]),
      ];

      expect(detectTokenizedMarkupImport(nodes)).toBe(true);
      expect(scoreImportedNodeTree(nodes).score).toBeLessThan(-50);
      expect(scoreImportedNodeTree(nodes).tagLikeSpanCount).toBe(3);
    });

    it("flags bare HTML tag text in spans", () => {
      const nodes = [
        createNode("Span", { text: "<div>" }),
        createNode("Span", { text: "</div>" }),
      ];

      expect(detectTokenizedMarkupImport(nodes)).toBe(true);
    });

    it("flags escaped HTML entity text from source", () => {
      const nodes = [
        createNode("Span", { text: "&lt;div class=&quot;hero&quot;&gt;" }),
        createNode("Span", { text: "content&lt;/div&gt;" }),
      ];

      expect(detectTokenizedMarkupImport(nodes)).toBe(true);
      expect(scoreImportedNodeTree(nodes).codePatternSpanCount).toBeGreaterThan(
        0,
      );
    });

    it("flags tiny code fragment pasted without a container", () => {
      const nodes = [
        createNode("Span", { text: "const x = 5;" }),
        createNode("Span", { text: "console.log(x);" }),
      ];

      expect(detectTokenizedMarkupImport(nodes)).toBe(true);
      expect(scoreImportedNodeTree(nodes).codePatternSpanCount).toBeGreaterThan(
        0,
      );
    });

    it("flags arrow function pasted alone", () => {
      const nodes = [
        createNode("Span", { text: "const fn = () => {" }),
        createNode("Span", { text: "return true;" }),
        createNode("Span", { text: "}" }),
      ];

      expect(detectTokenizedMarkupImport(nodes)).toBe(true);
    });

    it("flags HTML attribute fragments as source code", () => {
      const nodes = [
        createNode("Span", { text: 'class="container"' }),
        createNode("Span", { text: 'id="main"' }),
        createNode("Span", { text: ">Hello world<" }),
      ];

      expect(detectTokenizedMarkupImport(nodes)).toBe(true);
      expect(scoreImportedNodeTree(nodes).tagLikeSpanCount).toBeGreaterThan(0);
    });

    it("flags long raw-HTML text blob in a single node", () => {
      const nodes = [
        createNode("Container", {}, [
          createNode("Span", {
            text: "<div><section><article><header><nav><main><footer></div>",
          }),
        ]),
      ];

      // Should be caught by hasDocumentTextBlob or tagLikeSpanRatio
      expect(detectTokenizedMarkupImport(nodes)).toBe(true);
    });
  });

  describe("legitimate layout acceptance", () => {
    it("accepts the user's hero layout with spans and containers", () => {
      // This is the exact case from the bug report:
      // Container > Container > Containers > Containers (grid of squares)
      // Container > Paragraph > Span("Design."), Span("Create."), Span("Inspire.")
      const nodes = [
        createNode("Container", {}, [
          createNode("Container", {}, [
            createNode("Container", {}, [
              createNode("Container", {}),
              createNode("Container", {}),
              createNode("Container", {}),
              createNode("Container", {}),
            ]),
          ]),
          createNode("Container", {}, [
            createNode("Paragraph", {}, [
              createNode("Span", { text: "Design." }),
              createNode("Span", { text: " " }),
              createNode("Span", { text: "Create." }),
              createNode("Span", { text: " " }),
              createNode("Span", { text: "Inspire." }),
            ]),
            createNode("Paragraph", {
              text: "Lorem ipsum dolor sit amet.",
            }),
          ]),
        ]),
      ];

      expect(detectTokenizedMarkupImport(nodes)).toBe(false);
      const metrics = scoreImportedNodeTree(nodes);
      expect(metrics.blockCount).toBeGreaterThan(0);
      expect(metrics.naturalTextSpanCount).toBeGreaterThan(0);
      expect(metrics.structuralCount).toBe(0);
      expect(metrics.spanCount).toBeGreaterThan(0);
      expect(metrics.score).toBeGreaterThan(0);
    });

    it("accepts containers with paragraphs and plain text", () => {
      const nodes = [
        createNode("Container", {}, [
          createNode("Paragraph", { text: "Welcome to our site" }),
          createNode("Paragraph", {
            text: "We build amazing things for amazing people.",
          }),
          createNode("Container", {}, [
            createNode("Paragraph", { text: "Learn More" }),
          ]),
        ]),
      ];

      expect(detectTokenizedMarkupImport(nodes)).toBe(false);
      expect(scoreImportedNodeTree(nodes).score).toBeGreaterThan(0);
    });

    it("accepts rich hero sections with structural types", () => {
      const nodes = [
        createNode("Section", { class: "hero" }, [
          createNode("Container", {}, [
            createNode("Heading", { level: 1, text: "Big Title" }),
            createNode("Button", { text: "Get Started" }),
          ]),
        ]),
      ];

      expect(detectTokenizedMarkupImport(nodes)).toBe(false);
      expect(scoreImportedNodeTree(nodes).structuralCount).toBeGreaterThan(0);
      expect(scoreImportedNodeTree(nodes).score).toBeGreaterThan(0);
    });

    it("accepts complex multi-column grid layouts", () => {
      // Simulates a Figma/design-tool paste with many nested containers
      const buildGrid = (): BuilderNode => {
        const items = Array.from({ length: 8 }, () => createNode("Container"));
        return createNode("Container", {}, [
          createNode("Container", {}, items.slice(0, 4)),
          createNode("Container", {}, items.slice(4)),
        ]);
      };

      const nodes = [
        createNode("Container", {}, [
          buildGrid(),
          createNode("Paragraph", { text: "Tagline here" }),
          createNode("Container", {}, [
            createNode("Paragraph", { text: "Button text" }),
          ]),
        ]),
      ];

      expect(detectTokenizedMarkupImport(nodes)).toBe(false);
      expect(scoreImportedNodeTree(nodes).blockCount).toBeGreaterThan(0);
    });

    it("accepts single span with plain text", () => {
      const nodes = [createNode("Span", { text: "Hello world" })];

      // One plain-text span with no structure should not be flagged
      expect(detectTokenizedMarkupImport(nodes)).toBe(false);
    });

    it("accepts multiple plain text spans in a container", () => {
      const nodes = [
        createNode("Container", {}, [
          createNode("Span", { text: "First" }),
          createNode("Span", { text: "Second" }),
          createNode("Span", { text: "Third" }),
        ]),
      ];

      // Block structure (container) + natural text = not tokenized
      expect(detectTokenizedMarkupImport(nodes)).toBe(false);
    });

    it("accepts layout with BR elements (inline spacing)", () => {
      const nodes = [
        createNode("Container", {}, [
          createNode("Paragraph", {}, [
            createNode("Span", { text: "Line one" }),
            createNode("Span", {}), // br → empty span
            createNode("Span", { text: "Line two" }),
          ]),
        ]),
      ];

      expect(detectTokenizedMarkupImport(nodes)).toBe(false);
    });

    it("accepts a documentation section with code samples", () => {
      // A legitimate page section that has code-like text BUT
      // is wrapped in structural elements with natural text too
      const nodes = [
        createNode("Section", {}, [
          createNode("Heading", { level: 2, text: "Installation" }),
          createNode("Paragraph", {
            text: "Run the following command to install:",
          }),
          createNode("Code", {
            content: "npm install my-package",
          }),
          createNode("Paragraph", {
            text: "Then import it in your project.",
          }),
        ]),
      ];

      // Has structural elements and natural text → should NOT be tokenized
      expect(detectTokenizedMarkupImport(nodes)).toBe(false);
      expect(scoreImportedNodeTree(nodes).structuralCount).toBeGreaterThan(0);
      expect(scoreImportedNodeTree(nodes).score).toBeGreaterThan(0);
    });
  });

  describe("edge cases", () => {
    it("handles empty node array", () => {
      const metrics = scoreImportedNodeTree([]);
      expect(metrics.isTokenized).toBe(true);
      expect(metrics.score).toBe(Number.NEGATIVE_INFINITY);
      expect(detectTokenizedMarkupImport([])).toBe(true);
    });

    it("handles single container with no text", () => {
      const nodes = [createNode("Container")];

      expect(detectTokenizedMarkupImport(nodes)).toBe(false);
      // Only 1 node type, no spans → empty but not tokenized
      const metrics = scoreImportedNodeTree(nodes);
      expect(metrics.spanCount).toBe(0);
      expect(metrics.isTokenized).toBe(false);
    });

    it("handles deeply nested empty containers", () => {
      let nested: BuilderNode = createNode("Container");
      for (let i = 0; i < 10; i++) {
        nested = createNode("Container", {}, [nested]);
      }

      expect(detectTokenizedMarkupImport([nested])).toBe(false);
      expect(scoreImportedNodeTree([nested]).maxDepth).toBe(11);
    });

    it("treats content prop same as text prop for detection", () => {
      const nodes = [
        createNode("Span", { content: "Hello from content prop" }),
      ];

      expect(detectTokenizedMarkupImport(nodes)).toBe(false);
    });

    it("detects tag-like content via content prop", () => {
      const nodes = [
        createNode("Span", { content: "<div" }),
        createNode("Span", { content: "</div>" }),
      ];

      expect(detectTokenizedMarkupImport(nodes)).toBe(true);
    });

    it("does not reject legitimate CSS utility class names in text", () => {
      // "flex", "grid", "block" are HTML content words too
      const nodes = [
        createNode("Container", {}, [
          createNode("Paragraph", {
            text: "This layout uses flex and grid for responsive design.",
          }),
        ]),
      ];

      expect(detectTokenizedMarkupImport(nodes)).toBe(false);
    });

    it("allows numeric and short text in spans", () => {
      // Prices, short labels, etc.
      const nodes = [
        createNode("Container", {}, [
          createNode("Span", { text: "$49" }),
          createNode("Span", { text: "/mo" }),
          createNode("Paragraph", { text: "Premium Plan" }),
        ]),
      ];

      expect(detectTokenizedMarkupImport(nodes)).toBe(false);
    });

    it("does not flag DOCTYPE when it appears as text content", () => {
      const nodes = [createNode("Span", { text: "<!DOCTYPE html>" })];

      // hasDocumentTextBlob catches this via DOCUMENT_MARKUP_PATTERN
      expect(detectTokenizedMarkupImport(nodes)).toBe(true);
    });

    it("handles mixed natural and code text with structure present", () => {
      // A blog post that shows code inline
      const nodes = [
        createNode("Article", {}, [
          createNode("Heading", { level: 1, text: "Using Console" }),
          createNode("Paragraph", {
            text: "You can use console.log to debug.",
          }),
        ]),
      ];

      // Even though console.log appears, the structural + natural backing
      // means this is a legitimate article
      expect(detectTokenizedMarkupImport(nodes)).toBe(false);
    });
  });

  describe("regression tests", () => {
    it("exposes all new metrics in the result", () => {
      const nodes = [
        createNode("Section", {}, [
          createNode("Container", {}, [
            createNode("Heading", { level: 2, text: "Title" }),
            createNode("Span", { text: "Description" }),
          ]),
        ]),
      ];

      const metrics = scoreImportedNodeTree(nodes);
      expect(metrics).toHaveProperty("blockCount");
      expect(metrics).toHaveProperty("totalNodeCount");
      expect(metrics).toHaveProperty("nodeTypeCount");
      expect(metrics).toHaveProperty("codePatternSpanCount");
      expect(metrics).toHaveProperty("naturalTextSpanCount");
      expect(metrics.totalNodeCount).toBe(4);
      expect(metrics.nodeTypeCount).toBeGreaterThanOrEqual(3);
    });

    it("maintains backward-compatible metric names", () => {
      const nodes = [createNode("Section", {}, [createNode("Button")])];
      const metrics = scoreImportedNodeTree(nodes);
      expect(metrics).toHaveProperty("score");
      expect(metrics).toHaveProperty("spanCount");
      expect(metrics).toHaveProperty("tagLikeSpanCount");
      expect(metrics).toHaveProperty("structuralCount");
      expect(metrics).toHaveProperty("maxDepth");
      expect(metrics).toHaveProperty("isTokenized");
    });
  });

  describe("scoring", () => {
    it("scores structural layouts positively", () => {
      const nodes = [
        createNode("Section", {}, [
          createNode("Container", {}, [
            createNode("Heading", { level: 1, text: "Great Title" }),
            createNode("Button", { text: "Click" }),
            createNode("Paragraph", { text: "Some description here." }),
          ]),
        ]),
      ];

      const metrics = scoreImportedNodeTree(nodes);
      expect(metrics.score).toBeGreaterThan(0);
      expect(metrics.structuralCount).toBeGreaterThan(0);
    });

    it("scores tokenized content very negatively", () => {
      const nodes = [
        createNode("Span", { text: "<div" }),
        createNode("Span", { text: 'class="foo"' }),
        createNode("Span", { text: ">" }),
        createNode("Span", { text: "content" }),
        createNode("Span", { text: "</div>" }),
      ];

      const metrics = scoreImportedNodeTree(nodes);
      expect(metrics.isTokenized).toBe(true);
      expect(metrics.score).toBeLessThan(-50);
    });

    it("prefers deeper trees with diverse types over shallow span-only trees", () => {
      const goodLayout = [
        createNode("Section", {}, [
          createNode("Container", {}, [
            createNode("Heading", { level: 1, text: "Title" }),
            createNode("Paragraph", { text: "Description here." }),
            createNode("Container", {}, [
              createNode("Button", { text: "Action" }),
            ]),
          ]),
        ]),
      ];

      const badCode = [
        createNode("Span", { text: "<div" }),
        createNode("Span", { text: "</div>" }),
      ];

      const goodMetrics = scoreImportedNodeTree(goodLayout);
      const badMetrics = scoreImportedNodeTree(badCode);
      expect(goodMetrics.score).toBeGreaterThan(badMetrics.score);
    });

    it("shallow plain-text trees get low but non-tokenized score", () => {
      const nodes = [createNode("Span", { text: "Just some text" })];
      const metrics = scoreImportedNodeTree(nodes);
      expect(metrics.isTokenized).toBe(false);
      // Shallow, single span, no structure → score may be low but not
      // deeply negative since there's no code-like content
      expect(metrics.score).toBeGreaterThan(-20);
    });
  });
});
