import { computed, type ComputedRef } from "vue";
import { useBuilderData } from "@/composables/useBuilderData";
import {
  SiteUniverseEdgeSchema,
  SiteUniverseNodeSchema,
  SiteUniverseSatelliteSchema,
  SiteUniverseSchema,
  type DashboardPublicationStatus,
  type SiteUniverse,
  type SiteUniverseAttention,
  type SiteUniverseEdge,
  type SiteUniverseNode,
  type SiteUniverseNodeRole,
  type SiteUniverseSatellite,
  type SiteUniverseCmsSystem,
} from "../schemas/dashboard";
import { useSiteUniverseCms } from "./useSiteUniverseCms";

export type SiteUniversePageInput = ReturnType<
  typeof useBuilderData
>["pages"]["value"][number];

export type SiteUniverseComponentInput = ReturnType<
  typeof useBuilderData
>["components"]["value"][number];

interface PositionedPage {
  readonly page: SiteUniversePageInput;
  readonly parentSlug: string | null;
  readonly depth: number;
  readonly x: number;
  readonly y: number;
}

const RECENT_EDIT_WINDOW_MS = 1000 * 60 * 60 * 24 * 3;
export const SITE_UNIVERSE_CORE_ID = "site-core";
const SITE_X = 50;
const SITE_Y = 50;
const HOME_ORBIT_ANGLE = -90;
const FAR_SATELLITE_CENTERS = [
  { x: 20, y: 18 },
  { x: 50, y: 13 },
  { x: 80, y: 18 },
] as const;

export interface UseSiteUniverseReturn {
  readonly universe: ComputedRef<SiteUniverse>;
}

interface SiteUniverseEndpoint {
  readonly id: string;
  readonly slug: string;
  readonly x: number;
  readonly y: number;
  readonly status?: DashboardPublicationStatus;
}

const SITE_CORE_ENDPOINT: SiteUniverseEndpoint = {
  id: SITE_UNIVERSE_CORE_ID,
  slug: SITE_UNIVERSE_CORE_ID,
  x: SITE_X,
  y: SITE_Y,
};

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isHomePage(page: SiteUniversePageInput): boolean {
  return page.slug === "index" || page.slug === "home";
}

function resolveHomePage(
  pages: readonly SiteUniversePageInput[],
): SiteUniversePageInput | null {
  return (
    pages.find((page) => page.slug === "index") ??
    pages.find((page) => page.slug === "home") ??
    null
  );
}

function pageSortWeight(page: SiteUniversePageInput): number {
  if (isHomePage(page)) return 0;
  if (page.status === "published") return 1;
  if (page.status === "scheduled") return 2;
  if (page.status === "draft") return 3;
  return 3;
}

function sortPages(a: SiteUniversePageInput, b: SiteUniversePageInput): number {
  const weightDelta = pageSortWeight(a) - pageSortWeight(b);
  if (weightDelta !== 0) return weightDelta;

  const timeDelta =
    new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime();
  if (timeDelta !== 0) return timeDelta;

  return a.title.localeCompare(b.title);
}

function resolveParentSlug(
  page: SiteUniversePageInput,
  pageSlugs: ReadonlySet<string>,
): string | null {
  const parent = page.parent?.trim();
  if (parent && parent !== page.slug && pageSlugs.has(parent)) return parent;
  return null;
}

function resolveDepth(
  page: SiteUniversePageInput,
  pagesBySlug: ReadonlyMap<string, SiteUniversePageInput>,
  seen = new Set<string>(),
): number {
  const parent = page.parent?.trim();
  if (!parent || parent === page.slug || seen.has(parent)) return 1;
  const parentPage = pagesBySlug.get(parent);
  if (!parentPage) return 1;

  seen.add(parent);
  return clamp(resolveDepth(parentPage, pagesBySlug, seen) + 1, 1, 4);
}

function positionRootPage(
  page: SiteUniversePageInput,
  index: number,
  total: number,
  isHome: boolean,
) {
  if (isHome) {
    const angle = HOME_ORBIT_ANGLE * (Math.PI / 180);
    return {
      x: SITE_X + Math.cos(angle) * 29,
      y: SITE_Y + Math.sin(angle) * 27,
    };
  }

  const safeTotal = Math.max(total, 1);
  const baseAngle = -42;
  const sweep = 286;
  const angle =
    (baseAngle +
      (safeTotal === 1 ? sweep / 2 : (sweep * index) / (safeTotal - 1))) *
    (Math.PI / 180);
  const hash = stableHash(page.slug);
  const radiusX = 33 + (hash % 8);
  const radiusY = 30 + ((hash >> 3) % 8);

  return {
    x: clamp(SITE_X + Math.cos(angle) * radiusX, 9, 91),
    y: clamp(SITE_Y + Math.sin(angle) * radiusY, 11, 89),
  };
}

function positionChildPage(
  page: SiteUniversePageInput,
  parent: PositionedPage,
  siblingIndex: number,
  siblingTotal: number,
) {
  const safeTotal = Math.max(siblingTotal, 1);
  const offsetIndex = siblingIndex - (safeTotal - 1) / 2;
  const hash = stableHash(page.slug);
  const dx = parent.x - SITE_X;
  const dy = parent.y - SITE_Y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const directionX = dx / distance;
  const directionY = dy / distance;
  const tangentX = -directionY;
  const tangentY = directionX;
  const outward = 9 + parent.depth * 2;
  const siblingOffset = offsetIndex * 6;
  const jitter = (hash % 5) - 2;

  return {
    x: clamp(
      parent.x + directionX * outward + tangentX * siblingOffset + jitter,
      8,
      92,
    ),
    y: clamp(
      parent.y +
        directionY * outward +
        tangentY * siblingOffset +
        (((hash >> 5) % 5) - 2),
      10,
      90,
    ),
  };
}

function resolveNodeRole(
  page: SiteUniversePageInput,
  home: SiteUniversePageInput | null,
): SiteUniverseNodeRole {
  if (page.id === home?.id) return "home";
  if (page.systemRole === "not-found" || page.systemRole === "cms-entry") {
    return "system";
  }
  return "page";
}

function resolveAttention(
  page: SiteUniversePageInput,
  home: SiteUniversePageInput | null,
): SiteUniverseAttention {
  if (page.id === home?.id && page.status !== "published") return "warning";
  if (page.systemRole === "not-found" || page.systemRole === "cms-entry") {
    return "none";
  }
  if (page.status === "draft") return "warning";
  if (page.status === "scheduled") return "none";
  if (page.status === "archived") return "none";
  return "none";
}

function isRecentPage(page: SiteUniversePageInput, nowMs: number): boolean {
  if (!page.updatedAt) return false;
  const updatedMs = new Date(page.updatedAt).getTime();
  return (
    Number.isFinite(updatedMs) && nowMs - updatedMs <= RECENT_EDIT_WINDOW_MS
  );
}

function buildEdgePath(
  from: SiteUniverseEndpoint,
  to: SiteUniverseEndpoint,
): string {
  const midX = (from.x + to.x) / 2;
  const bend = to.y >= from.y ? 5 : -5;
  const c1x = midX;
  const c1y = from.y + bend;
  const c2x = midX;
  const c2y = to.y - bend;
  return `M ${from.x.toFixed(2)} ${from.y.toFixed(2)} C ${c1x.toFixed(
    2,
  )} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${to.x.toFixed(
    2,
  )} ${to.y.toFixed(2)}`;
}

function buildNode(
  page: SiteUniversePageInput,
  home: SiteUniversePageInput | null,
  position: PositionedPage,
  nowMs: number,
): SiteUniverseNode {
  const role = resolveNodeRole(page, home);
  const status: DashboardPublicationStatus = page.status;
  const isRecent = isRecentPage(page, nowMs);

  return SiteUniverseNodeSchema.parse({
    id: page.id,
    title: page.title,
    slug: page.slug,
    status,
    role,
    depth: position.depth,
    x: position.x,
    y: position.y,
    size: role === "home" ? 5.2 : role === "system" ? 2.8 : 3.2,
    attention: resolveAttention(page, home),
    lastEditedAt: page.updatedAt,
    isRecent,
  });
}

function buildEdge(
  from: SiteUniverseEndpoint,
  to: SiteUniverseEndpoint,
): SiteUniverseEdge {
  const hash = stableHash(`${from.slug}:${to.slug}`);
  const motionRoll = hash % 10;
  const motion = motionRoll < 4 ? "still" : motionRoll < 8 ? "drift" : "pulse";

  return SiteUniverseEdgeSchema.parse({
    id: `${from.id}->${to.id}`,
    from: from.id,
    to: to.id,
    path: buildEdgePath(from, to),
    durationMs: 10_800 + (hash % 11_600),
    delayMs: (hash >>> 5) % 16_000,
    opacity:
      to.status === "archived"
        ? 0.14
        : to.status === "draft"
          ? 0.24
          : to.status === "scheduled"
            ? 0.28
            : 0.32,
    motion,
    direction: (hash >>> 7) % 2 === 0 ? "outbound" : "inbound",
    hasPacket: motion === "pulse" && (hash >>> 11) % 3 !== 0,
  });
}

function buildSatellites(
  components: readonly SiteUniverseComponentInput[],
): SiteUniverseSatellite[] {
  return [...components]
    .filter((component) => component.id && component.name)
    .sort((a, b) => {
      const sourceDelta =
        (a.source === "custom" ? 0 : 1) - (b.source === "custom" ? 0 : 1);
      if (sourceDelta !== 0) return sourceDelta;

      const timeDelta =
        new Date(b.updatedAt ?? 0).getTime() -
        new Date(a.updatedAt ?? 0).getTime();
      return timeDelta || a.name.localeCompare(b.name);
    })
    .slice(0, 6)
    .map((component, index) => {
      const hash = stableHash(component.id);
      const durationMs = 38_000 + (hash % 26_000);
      const isFar = index >= 3;
      const farCenter =
        FAR_SATELLITE_CENTERS[(index - 3) % FAR_SATELLITE_CENTERS.length] ??
        FAR_SATELLITE_CENTERS[0];

      return SiteUniverseSatelliteSchema.parse({
        id: `component-satellite:${component.id}`,
        componentId: component.id,
        title: component.name,
        source: component.source ?? "custom",
        band: isFar ? "far" : "near",
        orbitCenterX: isFar ? farCenter.x : SITE_X,
        orbitCenterY: isFar ? farCenter.y : SITE_Y,
        orbitRadiusPx: isFar
          ? 62 + ((hash >>> 4) % 10)
          : 78 + (index % 3) * 38 + ((hash >>> 4) % 8),
        orbitAngleDeg: hash % 360,
        durationMs,
        phaseMs: hash % durationMs,
        size: component.source === "aria" ? 5 : 6,
      });
    });
}

function positionPages(
  pages: readonly SiteUniversePageInput[],
  home: SiteUniversePageInput | null,
) {
  const pagesBySlug = new Map(pages.map((page) => [page.slug, page]));
  const pageSlugs = new Set(pagesBySlug.keys());
  const roots = pages
    .filter(
      (page) =>
        page.id === home?.id || resolveParentSlug(page, pageSlugs) === null,
    )
    .sort(sortPages);
  const otherRoots = roots.filter((page) => page.id !== home?.id);

  const positioned = new Map<string, PositionedPage>();
  roots.forEach((page) => {
    const isHome = page.id === home?.id;
    const rootIndex = isHome
      ? 0
      : otherRoots.findIndex((root) => root.id === page.id);
    const point = positionRootPage(page, rootIndex, otherRoots.length, isHome);
    positioned.set(page.slug, {
      page,
      parentSlug: null,
      depth: 1,
      x: point.x,
      y: point.y,
    });
  });

  const parented = pages
    .filter((page) => page.id !== home?.id)
    .filter((page) => resolveParentSlug(page, pageSlugs) !== null)
    .sort((a, b) => {
      const depthDelta =
        resolveDepth(a, pagesBySlug) - resolveDepth(b, pagesBySlug);
      return depthDelta || sortPages(a, b);
    });

  for (const page of parented) {
    const parentSlug = resolveParentSlug(page, pageSlugs);
    const parent = parentSlug ? positioned.get(parentSlug) : null;
    if (!parent) continue;

    const siblings = parented.filter(
      (candidate) => candidate.parent === parentSlug,
    );
    const siblingIndex = siblings.findIndex(
      (candidate) => candidate.id === page.id,
    );
    const point = positionChildPage(
      page,
      parent,
      siblingIndex,
      siblings.length,
    );
    positioned.set(page.slug, {
      page,
      parentSlug,
      depth: resolveDepth(page, pagesBySlug),
      x: point.x,
      y: point.y,
    });
  }

  for (const page of [...pages].sort(sortPages)) {
    if (positioned.has(page.slug)) continue;
    const point = positionRootPage(
      page,
      positioned.size,
      pages.length,
      page.id === home?.id,
    );
    positioned.set(page.slug, {
      page,
      parentSlug: null,
      depth: 1,
      x: point.x,
      y: point.y,
    });
  }

  return [...positioned.values()];
}

export function buildSiteUniverseFromPages(
  pages: readonly SiteUniversePageInput[],
  nowMs = Date.now(),
  components: readonly SiteUniverseComponentInput[] = [],
  cmsSystems: readonly SiteUniverseCmsSystem[] = [],
): SiteUniverse {
  const validPages = pages.filter((page) => page.slug && page.title);
  const home = resolveHomePage(validPages);
  const positioned = positionPages(validPages, home).slice(0, 36);
  const nodes = positioned.map((position) =>
    buildNode(position.page, home, position, nowMs),
  );
  const nodeBySlug = new Map(nodes.map((node) => [node.slug, node] as const));

  const edges = positioned
    .map((position) => {
      const from = position.parentSlug
        ? nodeBySlug.get(position.parentSlug)
        : SITE_CORE_ENDPOINT;
      const to = nodeBySlug.get(position.page.slug);
      return from && to ? buildEdge(from, to) : null;
    })
    .filter((edge): edge is SiteUniverseEdge => edge !== null);

  return SiteUniverseSchema.parse({
    nodes,
    edges: edges.slice(0, 48),
    satellites: buildSatellites(components),
    cmsSystems,
  });
}

export function useSiteUniverse(): UseSiteUniverseReturn {
  const { pages, components } = useBuilderData();
  const { cmsSystems } = useSiteUniverseCms();

  const universe = computed(
    (): SiteUniverse =>
      buildSiteUniverseFromPages(
        pages.value,
        Date.now(),
        components.value,
        cmsSystems.value,
      ),
  );

  return { universe };
}
