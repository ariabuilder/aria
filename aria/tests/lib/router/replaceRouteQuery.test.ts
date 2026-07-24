import { describe, expect, it } from "vitest";
import type { RouteLocationNormalizedLoaded } from "vue-router";
import {
  buildRouteQueryReplaceLocation,
  isComposerRoute,
} from "../../../admin/lib/router/replaceRouteQuery";

function mockRoute(
  overrides: Partial<RouteLocationNormalizedLoaded> = {},
): RouteLocationNormalizedLoaded {
  return {
    path: "/pages/testing",
    hash: "",
    query: { composer: "" },
    ...overrides,
  } as RouteLocationNormalizedLoaded;
}

describe("replaceRouteQuery", () => {
  it("preserves path and hash when updating query", () => {
    const location = buildRouteQueryReplaceLocation(mockRoute(), (query) => ({
      ...query,
      search: "true",
    }));

    expect(location).toEqual({
      path: "/pages/testing",
      hash: "",
      query: { composer: null, search: "true" },
    });
  });

  it("preserves bare composer flag as null for URL serialization", () => {
    const location = buildRouteQueryReplaceLocation(
      mockRoute({ query: { composer: "" } }),
      (query) => {
        const nextQuery = { ...query };
        delete nextQuery.search;
        return nextQuery;
      },
    );

    expect(location.query).toEqual({ composer: null });
  });

  it("preserves composer when absent from mutate result", () => {
    const location = buildRouteQueryReplaceLocation(
      mockRoute({ query: { composer: "" } }),
      (query) => ({
        search: "true",
        // spread omitted — mutate only sets search
        ...Object.fromEntries(
          Object.entries(query).filter(([key]) => key !== "composer"),
        ),
      }),
    );

    expect(location.query.composer).toBeNull();
    expect(location.query.search).toBe("true");
  });

  it("does not add composer when it was not on the current route", () => {
    const location = buildRouteQueryReplaceLocation(
      mockRoute({ query: { search: "true" } }),
      (query) => {
        const nextQuery = { ...query };
        delete nextQuery.search;
        return nextQuery;
      },
    );

    expect(location.query).toEqual({});
  });
});

describe("isComposerRoute", () => {
  it("returns true when composer is present on the query", () => {
    expect(isComposerRoute({ composer: "" })).toBe(true);
    expect(isComposerRoute({ composer: "true" })).toBe(true);
  });

  it("returns false when composer is absent", () => {
    expect(isComposerRoute({ search: "true" })).toBe(false);
    expect(isComposerRoute({})).toBe(false);
  });
});
