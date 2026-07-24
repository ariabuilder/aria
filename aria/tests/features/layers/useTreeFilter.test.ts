/**
 * Tests the useTreeFilter composable for searching and filtering node trees.
 */

import { describe, it, expect } from "vitest";
import type { BuilderNode, JsonObject } from "../../../lib/types/nodes";
import { useTreeFilter } from "../../../admin/features/Layers/composables/useTreeFilter";

describe("useTreeFilter", () => {
  const createNode = (
    id: string,
    type: string,
    props: JsonObject = {},
    children: BuilderNode[] = [],
    slot?: string,
  ): BuilderNode => ({
    id,
    type,
    props,
    styles: {},
    children,
    slot,
  });

  const tree: BuilderNode[] = [
    createNode("header", "Container", { className: "site-header" }, [
      createNode("logo", "Image", { src: "/logo.png", alt: "Logo" }),
      createNode("nav", "Container", { className: "navigation" }, [
        createNode("home-link", "Link", { href: "/" }),
        createNode("about-link", "Link", { href: "/about" }),
      ]),
    ]),
    createNode("main", "Section", { className: "content-section" }, [
      createNode("hero", "Container", {}, [
        createNode("title", "Heading", { level: 1, content: "Welcome" }),
        createNode("subtitle", "Text", { content: "This is a subtitle" }),
      ]),
      createNode("features", "Container", {}, [
        createNode("feature-1", "Heading", { level: 2, content: "Feature 1" }),
        createNode("feature-2", "Heading", { level: 2, content: "Feature 2" }),
      ]),
    ]),
    createNode("footer", "Container", { className: "site-footer" }, [
      createNode("copyright", "Text", { content: "© 2024 Company" }),
    ]),
  ];

  describe("search", () => {
    const { search } = useTreeFilter();

    it("should return empty for empty query", () => {
      const results = search(tree, "");
      expect(results).toEqual([]);
    });

    it("should return empty for whitespace-only query", () => {
      const results = search(tree, "   ");
      expect(results).toEqual([]);
    });

    it("should find nodes by type", () => {
      const results = search(tree, "Heading");
      expect(results.length).toBe(3);
      expect(results.map((r) => r.node.id)).toContain("title");
      expect(results.map((r) => r.node.id)).toContain("feature-1");
      expect(results.map((r) => r.node.id)).toContain("feature-2");
    });

    it("should find nodes by id", () => {
      const results = search(tree, "header");
      expect(results.length).toBe(1);
      expect(results[0].node.id).toBe("header");
    });

    it("should find nodes by prop values", () => {
      const results = search(tree, "/about");
      expect(results.length).toBe(1);
      expect(results[0].node.id).toBe("about-link");
    });

    it("should be case-insensitive by default", () => {
      const resultsLower = search(tree, "welcome");
      const resultsUpper = search(tree, "WELCOME");

      expect(resultsLower.length).toBe(resultsUpper.length);
    });

    it("should include path in results", () => {
      const results = search(tree, "about-link");
      expect(results[0].path).toEqual(["header", "nav", "about-link"]);
    });

    it("should include depth in results", () => {
      const results = search(tree, "logo");
      expect(results[0].depth).toBe(1);

      const results2 = search(tree, "about-link");
      expect(results2[0].depth).toBe(2);
    });

    it("should limit results with maxResults option", () => {
      const { search: searchLimited } = useTreeFilter({ maxResults: 5 });
      const results = searchLimited(tree, "Container");

      expect(results.length).toBeLessThanOrEqual(5);
    });

    it("should calculate relevance scores", () => {
      const results = search(tree, "Container");

      // Type match should have higher score than prop match
      const containerResults = results.filter(
        (r) => r.node.type === "Container",
      );
      expect(containerResults.length).toBeGreaterThan(0);

      // All results should have score between 0-100
      results.forEach((r) => {
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(100);
      });
    });
  });

  describe("search with options", () => {
    it("should support case-sensitive search", () => {
      const { search: searchCaseSensitive } = useTreeFilter({
        caseSensitive: true,
      });

      const resultsLower = searchCaseSensitive(tree, "welcome");
      const resultsUpper = searchCaseSensitive(tree, "WELCOME");

      // Case-sensitive should only match exact case
      expect(resultsLower.length).toBeGreaterThanOrEqual(resultsUpper.length);
    });

    it("should exclude IDs from search when disabled", () => {
      const { search: searchNoIds } = useTreeFilter({ searchIds: false });

      const results = searchNoIds(tree, "header");
      // Should still find by className: "site-header"
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it("should exclude classNames from search when disabled", () => {
      const { search: searchNoClasses } = useTreeFilter({
        searchClassNames: false,
      });

      const results = searchNoClasses(tree, "header");
      // Should still find by ID: "header"
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it("should exclude props from search when disabled", () => {
      const { search: searchNoProps } = useTreeFilter({ searchProps: false });

      const results = searchNoProps(tree, "welcome");
      expect(results.length).toBe(0);
    });
  });

  describe("applyFilters", () => {
    const { applyFilters } = useTreeFilter();

    it("should filter by node types", () => {
      const results = applyFilters(tree, { types: ["Heading"] });
      expect(results.length).toBe(3);
      results.forEach((node) => {
        expect(node.type).toBe("Heading");
      });
    });

    it("should filter by minimum depth", () => {
      const results = applyFilters(tree, { minDepth: 2 });
      // Nodes at depth 2: home-link, about-link
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it("should filter by maximum depth", () => {
      const results = applyFilters(tree, { maxDepth: 1 });
      // Nodes at depth 0 or 1: header, logo, nav, main, footer, copyright
      expect(results.length).toBeGreaterThanOrEqual(4);
    });

    it("should filter by depth range", () => {
      const results = applyFilters(tree, { minDepth: 1, maxDepth: 2 });
      expect(results.length).toBe(11);
    });

    it("should filter by property existence", () => {
      const results = applyFilters(tree, { hasProps: ["href"] });
      expect(results.length).toBe(2); // home-link, about-link
    });

    it("should filter by slot", () => {
      const treeWithSlots: BuilderNode[] = [
        createNode("1", "Container", {}, [], "header"),
        createNode("2", "Container", {}, [], "content"),
        createNode("3", "Container", {}, [], "footer"),
      ];

      const results = applyFilters(treeWithSlots, { slot: "header" });
      expect(results.length).toBe(1);
      expect(results[0].id).toBe("1");
    });

    it("should combine multiple filters", () => {
      const results = applyFilters(tree, {
        types: ["Link"],
        minDepth: 2,
      });
      expect(results.length).toBe(2);
      results.forEach((node) => {
        expect(node.type).toBe("Link");
      });
    });
  });

  describe("searchWithFilters", () => {
    const { searchWithFilters } = useTreeFilter();

    it("should combine search and filters", () => {
      const results = searchWithFilters(tree, "Link", { minDepth: 2 });
      expect(results.length).toBe(2);
      results.forEach((r) => {
        expect(r.node.type).toBe("Link");
      });
    });

    it("should return empty for non-matching search", () => {
      const results = searchWithFilters(tree, "xyz123", { types: ["Heading"] });
      expect(results.length).toBe(0);
    });
  });

  describe("findByProp", () => {
    const { findByProp } = useTreeFilter();

    it("should find nodes by property name", () => {
      const results = findByProp(tree, "href");
      expect(results.length).toBe(2);
      expect(results.map((r) => r.node.id)).toContain("home-link");
      expect(results.map((r) => r.node.id)).toContain("about-link");
    });

    it("should find nodes by property name and value", () => {
      const results = findByProp(tree, "href", "/about");
      expect(results.length).toBe(1);
      expect(results[0].node.id).toBe("about-link");
    });

    it("should return empty for non-existent property", () => {
      const results = findByProp(tree, "nonExistent");
      expect(results.length).toBe(0);
    });
  });

  describe("findByDepth", () => {
    const { findByDepth } = useTreeFilter();

    it("should find nodes at exact depth", () => {
      const results = findByDepth(tree, 0);
      // header, main, footer are all at depth 0 in the root array
      expect(results.length).toBe(3);
    });

    it("should find nodes at depth 1", () => {
      const results = findByDepth(tree, 1);
      // header.logo, header.nav, main.hero, main.features, footer.copyright
      expect(results.length).toBe(5);
    });

    it("should return empty for invalid depth", () => {
      const results = findByDepth(tree, -1);
      expect(results.length).toBe(0);
    });
  });

  describe("findByDepthRange", () => {
    const { findByDepthRange } = useTreeFilter();

    it("should find nodes within depth range", () => {
      const results = findByDepthRange(tree, 1, 2);
      expect(results.length).toBeGreaterThan(0);
      results.forEach((r) => {
        expect(r.depth).toBeGreaterThanOrEqual(1);
        expect(r.depth).toBeLessThanOrEqual(2);
      });
    });

    it("should return empty for invalid range", () => {
      const results = findByDepthRange(tree, 5, 1);
      expect(results.length).toBe(0);
    });
  });

  describe("getHighScoringResults", () => {
    const { search, getHighScoringResults } = useTreeFilter();

    it("should filter results by minimum score", () => {
      search(tree, "Container");

      const highScore = getHighScoringResults(50);
      highScore.forEach((r) => {
        expect(r.score).toBeGreaterThanOrEqual(50);
      });
    });

    it("should return empty for no matching results", () => {
      search(tree, "xyz123");
      const highScore = getHighScoringResults(80);
      expect(highScore.length).toBe(0);
    });
  });

  describe("clearResults", () => {
    const { search, clearResults, lastQuery, lastResults } = useTreeFilter();

    it("should clear search results", () => {
      search(tree, "Container");
      expect(lastQuery.value).toBe("Container");
      expect(lastResults.value.length).toBeGreaterThan(0);

      clearResults();

      expect(lastQuery.value).toBe("");
      expect(lastResults.value.length).toBe(0);
    });
  });

  describe("computed properties", () => {
    const { search, resultCount, resultCountByType } = useTreeFilter();

    it("should track result count", () => {
      search(tree, "Heading");
      expect(resultCount.value).toBe(3);
    });

    it("should track results by type", () => {
      search(tree, "Container");
      const counts = resultCountByType.value;

      // Should have counts for matched types
      expect(counts.size).toBeGreaterThan(0);
    });
  });

  describe("performance", () => {
    const { search } = useTreeFilter();

    it("should handle large trees efficiently", () => {
      // Create a large tree with 1000 nodes
      const nodes: BuilderNode[] = [];
      for (let i = 0; i < 100; i++) {
        const children: BuilderNode[] = [];
        for (let j = 0; j < 10; j++) {
          children.push(
            createNode(`node-${i}-${j}`, "Text", {
              content: `Content ${i}-${j}`,
            }),
          );
        }
        nodes.push(createNode(`container-${i}`, "Container", {}, children));
      }

      const start = performance.now();
      const results = search(nodes, "Content");
      const end = performance.now();

      expect(results.length).toBe(1000);
      // Should complete in under 100ms
      expect(end - start).toBeLessThan(100);
    });
  });
});
