import type {
  LocationQuery,
  RouteLocationNormalizedLoaded,
  Router,
} from "vue-router";

/** Bare URL flags that must survive query re-serialization (e.g. ?composer). */
const BARE_QUERY_KEYS = ["composer"] as const;

export type MutableLocationQuery = Record<
  string,
  LocationQuery[string] | undefined
>;

function preserveBareQueryKeys(
  currentQuery: LocationQuery,
  nextQuery: MutableLocationQuery,
): MutableLocationQuery {
  const result: MutableLocationQuery = { ...nextQuery };

  for (const key of BARE_QUERY_KEYS) {
    if (!(key in currentQuery)) {
      continue;
    }

    const value = currentQuery[key];
    // Bare keys use `null` so vue-router emits ?composer (no value).
    result[key] =
      value === null || value === undefined || value === ""
        ? null
        : value;
  }

  return result;
}

export function buildRouteQueryReplaceLocation(
  route: RouteLocationNormalizedLoaded,
  mutate: (query: MutableLocationQuery) => MutableLocationQuery,
): {
  path: string;
  hash: string;
  query: MutableLocationQuery;
} {
  const currentQuery = { ...route.query } as MutableLocationQuery;
  const nextQuery = preserveBareQueryKeys(
    route.query,
    mutate(currentQuery),
  );

  return {
    path: route.path,
    hash: route.hash,
    query: nextQuery,
  };
}

export function isComposerRoute(query: LocationQuery): boolean {
  return "composer" in query;
}

export function replaceRouteQuery(
  route: RouteLocationNormalizedLoaded,
  router: Router,
  mutate: (query: MutableLocationQuery) => MutableLocationQuery,
): void {
  router.replace(buildRouteQueryReplaceLocation(route, mutate));
}
