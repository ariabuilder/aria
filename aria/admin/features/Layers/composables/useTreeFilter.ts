/**
 * Layers Feature - Tree Filter
 *
 * Filters node tree based on search queries and criteria.
 */

import { ref, shallowRef, readonly, computed } from "vue";
import type { BuilderNode } from "../../../../lib/types/nodes";
import type {
  SearchResult,
  MatchInfo,
  SearchFilters,
  SearchOptions,
} from "../types";
import { traverseNodes } from "../utils/nodeHelpers";
import { log } from "@/lib/utils/logger";

const DEFAULT_SEARCH_OPTIONS: Required<Omit<SearchOptions, "maxResults">> & {
  maxResults: number;
} = {
  debug: false,
  caseSensitive: false,
  searchIds: true,
  searchClassNames: true,
  searchProps: true,
  searchMetadata: true,
  maxResults: 100,
  sortByScore: true,
};

/**
 * Tree filtering and search.
 *
 * Searches node tree based on query string and filters.
 *
 * @param options - Search options
 *
 * @example
 * ```ts
 * const filter = useTreeFilter({ caseSensitive: false });
 *
 * // Search nodes
 * const results = filter.search(nodes, 'button');
 *
 * // Apply filters
 * const filtered = filter.applyFilters(nodes, {
 *   types: ['Container', 'Section'],
 *   minDepth: 1
 * });
 * ```
 */
export function useTreeFilter(options: SearchOptions = {}) {
  const mergedOptions = { ...DEFAULT_SEARCH_OPTIONS, ...options };
  const {
    debug,
    caseSensitive,
    searchIds,
    searchClassNames,
    searchProps,
    searchMetadata,
    maxResults,
    sortByScore,
  } = mergedOptions;

  /**
   * Last search query
   */
  const lastQuery = ref<string>("");

  /**
   * Last search results
   */
  const lastResults = shallowRef<readonly SearchResult[]>([]);

  /**
   * Number of results from last search
   */
  const resultCount = computed<number>(() => lastResults.value.length);

  /**
   * Result count by node type.
   */
  const resultCountByType = computed<Map<string, number>>(() => {
    const counts = new Map<string, number>();
    lastResults.value.forEach((result) => {
      const count = counts.get(result.node.type) || 0;
      counts.set(result.node.type, count + 1);
    });
    return counts;
  });

  /**
   * Normalize string for comparison.
   */
  function normalizeString(str: string): string {
    return caseSensitive ? str : str.toLowerCase();
  }

  /**
   * Check if a string matches the query.
   */
  function matchesQuery(text: string, query: string): boolean {
    return normalizeString(text).includes(normalizeString(query));
  }

  /**
   * Calculate match information for a node.
   */
  function getMatchInfo(node: BuilderNode, query: string): MatchInfo {
    const matches: MatchInfo = {
      type: false,
      props: [],
      metadata: [],
      id: false,
      className: false,
    };

    if (matchesQuery(node.type, query)) {
      matches.type = true;
    }

    if (searchIds && matchesQuery(node.id, query)) {
      matches.id = true;
    }

    if (searchClassNames && node.classNames) {
      const allClasses = Object.values(node.classNames).flat();
      if (allClasses.some((c) => matchesQuery(c, query))) {
        matches.className = true;
      }
    }
    if (searchClassNames && node.customClasses?.length) {
      if (node.customClasses.some((c) => matchesQuery(c, query))) {
        matches.className = true;
      }
    }

    if (searchProps && node.props) {
      for (const [key, value] of Object.entries(node.props)) {
        if (value && typeof value === "string" && matchesQuery(value, query)) {
          matches.props.push(key);
        }
        if (matchesQuery(key, query)) {
          matches.props.push(key);
        }
      }
    }

    if (searchMetadata && node.metadata) {
      for (const [key, value] of Object.entries(node.metadata)) {
        if (value && typeof value === "string" && matchesQuery(value, query)) {
          matches.metadata.push(key);
        }
      }
    }

    return matches;
  }

  /**
   * Calculate relevance score for a match.
   */
  function calculateScore(matches: MatchInfo): number {
    let score = 0;

    if (matches.type) score += 50;
    if (matches.id) score += 40;
    if (matches.className) score += 30;
    score += matches.props.length * 10;
    score += matches.metadata.length * 5;

    return Math.min(score, 100);
  }

  /**
   * Check if a node has any matches.
   */
  function hasMatches(matches: MatchInfo): boolean {
    return (
      matches.type ||
      matches.id ||
      matches.className ||
      matches.props.length > 0 ||
      matches.metadata.length > 0
    );
  }

  /**
   * Search nodes for a query string.
   *
   * @param nodes - Nodes to search
   * @param query - Search query
   * @returns Array of search results
   */
  function search(
    nodes: readonly BuilderNode[],
    query: string,
  ): readonly SearchResult[] {
    if (!query || query.trim().length === 0) {
      lastQuery.value = "";
      lastResults.value = [];
      return [];
    }

    lastQuery.value = query;
    const results: SearchResult[] = [];

    traverseNodes(nodes, (node, path, depth) => {
      const matches = getMatchInfo(node, query);

      if (hasMatches(matches)) {
        const score = calculateScore(matches);

        results.push({
          node,
          path: [...path],
          matches,
          score,
          depth,
        });

        // Stop if we've reached max results
        if (maxResults > 0 && results.length >= maxResults) {
          return;
        }
      }
    });

    // Sort by score if enabled
    if (sortByScore) {
      results.sort((a, b) => b.score - a.score);
    }

    lastResults.value = results;

    if (debug) {
      log("debug", "[useTreeFilter] Search completed", {
        query,
        resultCount: results.length,
      });
    }

    return results;
  }

  /**
   * Apply filters to nodes.
   *
   * @param nodes - Nodes to filter
   * @param filters - Filter criteria
   * @returns Filtered nodes
   */
  function applyFilters(
    nodes: readonly BuilderNode[],
    filters: SearchFilters,
  ): readonly BuilderNode[] {
    const filtered: BuilderNode[] = [];

    traverseNodes(nodes, (node, _path, depth) => {
      let matches = true;

      if (filters.types && filters.types.length > 0) {
        matches = matches && filters.types.includes(node.type);
      }

      if (filters.minDepth !== undefined) {
        matches = matches && depth >= filters.minDepth;
      }
      if (filters.maxDepth !== undefined) {
        matches = matches && depth <= filters.maxDepth;
      }

      if (filters.hasProps && filters.hasProps.length > 0) {
        matches =
          matches && filters.hasProps.some((prop) => prop in node.props);
      }

      if (filters.hasMetadata && filters.hasMetadata.length > 0) {
        matches =
          matches && filters.hasMetadata.some((key) => node.metadata?.[key]);
      }

      if (filters.slot !== undefined) {
        matches = matches && node.slot === filters.slot;
      }

      if (matches) {
        filtered.push(node);
      }
    });

    if (debug) {
      log("debug", "[useTreeFilter] Filters applied", {
        resultCount: filtered.length,
      });
    }

    return filtered;
  }

  /**
   * Search with filters applied.
   *
   * Performs search and applies filters in one operation.
   *
   * @param nodes - Nodes to search
   * @param query - Search query
   * @param filters - Filter criteria
   * @returns Filtered search results
   *
   * @example
   * ```ts
   * const results = searchWithFilters(nodes, 'button', {
   *   types: ['Button', 'IconButton'],
   *   minDepth: 1,
   *   maxDepth: 3
   * });
   * ```
   */
  function searchWithFilters(
    nodes: readonly BuilderNode[],
    query: string,
    filters: SearchFilters,
  ): readonly SearchResult[] {
    const results = search(nodes, query);

    let filteredResults = [...results];

    if (filters.types && filters.types.length > 0) {
      const typeSet = new Set(filters.types.map((t) => normalizeString(t)));
      filteredResults = filteredResults.filter((r) =>
        typeSet.has(normalizeString(r.node.type)),
      );
    }

    if (filters.minDepth !== undefined) {
      filteredResults = filteredResults.filter(
        (r) => r.depth >= filters.minDepth!,
      );
    }
    if (filters.maxDepth !== undefined) {
      filteredResults = filteredResults.filter(
        (r) => r.depth <= filters.maxDepth!,
      );
    }

    if (filters.hasProps && filters.hasProps.length > 0) {
      filteredResults = filteredResults.filter((r) =>
        filters.hasProps!.every((prop) => prop in r.node.props),
      );
    }

    if (filters.hasMetadata && filters.hasMetadata.length > 0) {
      filteredResults = filteredResults.filter((r) =>
        filters.hasMetadata!.every((key) => r.node.metadata?.[key]),
      );
    }

    if (filters.slot !== undefined) {
      filteredResults = filteredResults.filter(
        (r) => r.node.slot === filters.slot,
      );
    }

    lastResults.value = filteredResults;

    if (debug) {
      log("debug", "[useTreeFilter] searchWithFilters completed", {
        beforeCount: results.length,
        afterCount: filteredResults.length,
      });
    }

    return filteredResults;
  }

  /**
   * Find nodes by property name and optionally value.
   *
   * @param nodes - Nodes to search
   * @param propName - Property name to search for
   * @param propValue - Optional property value to match
   * @returns Search results with matching nodes
   *
   * @example
   * ```ts
   * const withHref = findByProp(nodes, 'href');
   * const withSpecificHref = findByProp(nodes, 'href', '/about');
   * ```
   */
  function findByProp(
    nodes: readonly BuilderNode[],
    propName: string,
    propValue?: unknown,
  ): readonly SearchResult[] {
    const results: SearchResult[] = [];

    traverseNodes(nodes, (node, path, depth) => {
      const hasProp = propName in node.props;
      const valueMatches =
        propValue === undefined || node.props[propName] === propValue;

      if (hasProp && valueMatches) {
        results.push({
          node,
          path: [...path],
          matches: {
            type: false,
            props: [propName],
            metadata: [],
            id: false,
            className: false,
          },
          score: 25, // PROP_MATCH weight
          depth,
        });
      }
    });

    if (debug) {
      log("debug", "[useTreeFilter] findByProp completed", {
        propName,
        resultCount: results.length,
      });
    }

    return results;
  }

  /**
   * Find nodes at a specific depth level.
   *
   * @param nodes - Nodes to search
   * @param depth - Depth level (0 = root)
   * @returns Search results at that depth
   *
   * @example
   * ```ts
   * const rootNodes = findByDepth(nodes, 0);
   * const secondLevel = findByDepth(nodes, 1);
   * ```
   */
  function findByDepth(
    nodes: readonly BuilderNode[],
    depth: number,
  ): readonly SearchResult[] {
    if (depth < 0) {
      if (debug) {
        log("warn", "[useTreeFilter] Invalid depth", { depth });
      }
      return [];
    }

    const results: SearchResult[] = [];

    traverseNodes(nodes, (node, path, currentDepth) => {
      if (currentDepth === depth) {
        results.push({
          node,
          path: [...path],
          matches: {
            type: false,
            props: [],
            metadata: [],
            id: false,
            className: false,
          },
          score: 0,
          depth: currentDepth,
        });
      }
    });

    if (debug) {
      log("debug", "[useTreeFilter] findByDepth completed", {
        depth,
        resultCount: results.length,
      });
    }

    return results;
  }

  /**
   * Find nodes within a depth range.
   *
   * @param nodes - Nodes to search
   * @param minDepth - Minimum depth (inclusive)
   * @param maxDepth - Maximum depth (inclusive)
   * @returns Search results in that range
   *
   * @example
   * ```ts
   * const midLevel = findByDepthRange(nodes, 1, 3);
   * ```
   */
  function findByDepthRange(
    nodes: readonly BuilderNode[],
    minDepth: number,
    maxDepth: number,
  ): readonly SearchResult[] {
    if (minDepth < 0 || maxDepth < 0 || minDepth > maxDepth) {
      if (debug) {
        log("warn", "[useTreeFilter] Invalid depth range", {
          minDepth,
          maxDepth,
        });
      }
      return [];
    }

    const results: SearchResult[] = [];

    traverseNodes(nodes, (node, path, depth) => {
      if (depth >= minDepth && depth <= maxDepth) {
        results.push({
          node,
          path: [...path],
          matches: {
            type: false,
            props: [],
            metadata: [],
            id: false,
            className: false,
          },
          score: 0,
          depth,
        });
      }
    });

    if (debug) {
      log("debug", "[useTreeFilter] findByDepthRange completed", {
        minDepth,
        maxDepth,
        resultCount: results.length,
      });
    }

    return results;
  }

  /**
   * Get results with score above threshold.
   *
   * @param minScore - Minimum score (0-100)
   * @returns Filtered high-scoring results
   *
   * @example
   * ```ts
   * const topResults = getHighScoringResults(80);
   * ```
   */
  function getHighScoringResults(minScore: number): readonly SearchResult[] {
    const filtered = lastResults.value.filter((r) => r.score >= minScore);

    if (debug) {
      log("debug", "[useTreeFilter] getHighScoringResults completed", {
        minScore,
        resultCount: filtered.length,
      });
    }

    return filtered;
  }

  /**
   * Clear search results.
   */
  function clearResults(): void {
    lastQuery.value = "";
    lastResults.value = [];
  }

  return {
    // State (readonly)
    lastQuery: readonly(lastQuery),
    lastResults: readonly(lastResults),
    resultCount,
    resultCountByType,

    search: readonly(search),
    searchWithFilters: readonly(searchWithFilters),
    applyFilters: readonly(applyFilters),
    clearResults: readonly(clearResults),

    findByProp: readonly(findByProp),
    findByDepth: readonly(findByDepth),
    findByDepthRange: readonly(findByDepthRange),
    getHighScoringResults: readonly(getHighScoringResults),

    getMatchInfo: readonly(getMatchInfo),
    calculateScore: readonly(calculateScore),
  };
}
