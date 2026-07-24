<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useStudioRouter } from "@/features/Studio/core/composables";
import { useStudioI18n } from "@/i18n";
import { studioIcons } from "@/lib/icons";
import { useSiteUniverse } from "../composables/useSiteUniverse";
import { useSiteUniverseFocus } from "../composables/useSiteUniverseFocus";
import type {
  DashboardPublicationStatus,
  SiteUniverseCmsEntry,
  SiteUniverseCmsSystem,
  SiteUniverseEdge,
  SiteUniverseNode,
  SiteUniverseSatellite,
} from "../schemas/dashboard";

defineOptions({ name: "SiteUniverseBackground" });

withDefaults(defineProps<{ siteTitle?: string }>(), {
  siteTitle: "Aria Builder",
});

const router = useStudioRouter();
const { t } = useStudioI18n();
const { universe } = useSiteUniverse();
const { activePageSlug, focusPage, clearFocus } = useSiteUniverseFocus();
const universeElement = ref<HTMLElement | null>(null);
const hoveredNodeId = ref<string | null>(null);
const focusedNodeId = ref<string | null>(null);
const departingNodeId = ref<string | null>(null);
const pointer = ref({ x: 50, y: 50, active: false });

let pointerFrame: number | null = null;
let pendingPointerEvent: PointerEvent | null = null;
let navigationTimer: number | null = null;

const hasUniverse = computed(
  () => universe.value.nodes.length > 0 || universe.value.cmsSystems.length > 0,
);
const activeNodeId = computed(() => {
  const sharedNode = activePageSlug.value
    ? universe.value.nodes.find((node) => node.slug === activePageSlug.value)
    : null;

  return (
    departingNodeId.value ??
    focusedNodeId.value ??
    hoveredNodeId.value ??
    sharedNode?.id ??
    null
  );
});
const activeBranchEdgeIds = computed(() => {
  const branch = new Set<string>();
  let currentNodeId = activeNodeId.value;
  let remaining = universe.value.edges.length;
  while (currentNodeId && remaining > 0) {
    const parentEdge = universe.value.edges.find(
      (edge) => edge.to === currentNodeId,
    );
    if (!parentEdge) break;
    branch.add(parentEdge.id);
    currentNodeId = parentEdge.from;
    remaining -= 1;
  }

  return branch;
});
const activeBranchNodeIds = computed(() => {
  const branch = new Set<string>();
  if (activeNodeId.value) branch.add(activeNodeId.value);

  for (const edge of universe.value.edges) {
    if (!activeBranchEdgeIds.value.has(edge.id)) continue;
    branch.add(edge.from);
    branch.add(edge.to);
  }

  return branch;
});
const packetEdgeIds = computed(() => {
  return new Set(
    universe.value.edges
      .filter((edge) => edge.hasPacket)
      .slice(0, 3)
      .map((edge) => edge.id),
  );
});

function nodeClass(node: SiteUniverseNode): string[] {
  return [
    "site-universe-node",
    `site-universe-node--${node.status}`,
    `site-universe-node--${node.role}`,
    node.attention !== "none" ? `site-universe-node--${node.attention}` : "",
    node.isRecent ? "site-universe-node--recent" : "",
    activeNodeId.value === node.id ? "site-universe-node--active" : "",
    departingNodeId.value === node.id ? "site-universe-node--departing" : "",
    isRelatedNode(node.id) ? "site-universe-node--related" : "",
  ].filter(Boolean);
}

function isRelatedNode(nodeId: string): boolean {
  return nodeId !== activeNodeId.value && activeBranchNodeIds.value.has(nodeId);
}

function labelClass(node: SiteUniverseNode): string[] {
  return [
    "site-universe-node__label",
    node.x >= 60 ? "site-universe-node__label--left" : "",
    node.y >= 68 ? "site-universe-node__label--above" : "",
  ].filter(Boolean);
}

function edgeClass(edge: SiteUniverseEdge): string[] {
  return [
    "site-universe-edge",
    `site-universe-edge--${edge.motion}`,
    `site-universe-edge--${edge.direction}`,
    activeBranchEdgeIds.value.has(edge.id) ? "site-universe-edge--active" : "",
  ].filter(Boolean);
}

function statusLabel(status: DashboardPublicationStatus): string {
  switch (status) {
    case "draft":
      return t("dashboard.status.draft");
    case "published":
      return t("dashboard.status.published");
    case "scheduled":
      return t("dashboard.status.scheduled");
    case "archived":
      return t("dashboard.status.archived");
  }
}

function resolveNodePull(node: SiteUniverseNode): { x: number; y: number } {
  if (!pointer.value.active) return { x: 0, y: 0 };

  const dx = pointer.value.x - node.x;
  const dy = pointer.value.y - node.y;
  const distance = Math.hypot(dx, dy);
  const influence = Math.max(0, 1 - distance / 28);
  const localStrength = influence * (4.8 + node.depth * 0.4);
  const parallaxStrength = 0.03 * (1 + node.depth * 0.16);

  return {
    x:
      (distance > 0 ? dx / distance : 0) * localStrength +
      (pointer.value.x - 50) * parallaxStrength,
    y:
      (distance > 0 ? dy / distance : 0) * localStrength +
      (pointer.value.y - 50) * parallaxStrength,
  };
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function nodeStyle(node: SiteUniverseNode): Record<string, string> {
  const pull = resolveNodePull(node);
  const hash = stableHash(node.id);
  const sway =
    node.role === "home"
      ? 2
      : node.depth <= 1
        ? 4 + (hash % 4)
        : 2 + (hash % 3);

  return {
    "--node-x": `${node.x}%`,
    "--node-y": `${node.y}%`,
    "--node-size": `${node.size * 2.5}px`,
    "--node-delay": `${(node.depth + 1) * 180}ms`,
    "--node-pull-x": `${pull.x.toFixed(2)}px`,
    "--node-pull-y": `${pull.y.toFixed(2)}px`,
    "--node-sway-x": `${sway}px`,
    "--node-sway-y": `${Math.max(2, sway - 1)}px`,
    "--node-sway-duration": `${8_200 + (hash % 4_800)}ms`,
    "--node-sway-delay": `${-(hash % 5_000)}ms`,
  };
}

function cmsSystemStyle(system: SiteUniverseCmsSystem): Record<string, string> {
  const angle = system.orbitStartPercent * 3.6;
  return {
    "--cms-orbit-start": `${system.orbitStartPercent}%`,
    "--cms-angle": `${angle}deg`,
    "--cms-angle-negative": `${-angle}deg`,
    "--cms-duration": `${system.durationMs}ms`,
    "--cms-phase": `${-system.phaseMs}ms`,
  };
}

function cmsEntryStyle(entry: SiteUniverseCmsEntry): Record<string, string> {
  return {
    "--entry-angle": `${entry.orbitAngleDeg}deg`,
    "--entry-angle-negative": `${-entry.orbitAngleDeg}deg`,
    "--entry-radius": `${entry.orbitRadiusPx}px`,
    "--entry-duration": `${entry.durationMs}ms`,
    "--entry-phase": `${-entry.phaseMs}ms`,
    "--entry-size": `${entry.size}px`,
  };
}

function satelliteStyle(
  satellite: SiteUniverseSatellite,
): Record<string, string> {
  return {
    "--satellite-radius": `${satellite.orbitRadiusPx}px`,
    "--satellite-center-x": `${satellite.orbitCenterX}%`,
    "--satellite-center-y": `${satellite.orbitCenterY}%`,
    "--satellite-angle": `${satellite.orbitAngleDeg}deg`,
    "--satellite-angle-negative": `${-satellite.orbitAngleDeg}deg`,
    "--satellite-duration": `${satellite.durationMs}ms`,
    "--satellite-phase": `${-satellite.phaseMs}ms`,
    "--satellite-size": `${satellite.size}px`,
  };
}

function openPage(node: SiteUniverseNode): void {
  if (departingNodeId.value) return;

  const navigate = (): void => {
    navigationTimer = null;
    router.navigateTo(`/pages/${node.slug}`);
  };
  const reduceMotion = window.matchMedia?.(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  departingNodeId.value = node.id;
  if (reduceMotion) {
    navigate();
    return;
  }

  navigationTimer = window.setTimeout(navigate, 240);
}

function openComponent(satellite: SiteUniverseSatellite): void {
  router.navigateTo(`/components/${satellite.componentId}`);
}

function openCollection(system: SiteUniverseCmsSystem): void {
  router.navigateTo(`/collections/${encodeURIComponent(system.name)}`);
}

function openCmsEntry(entry: SiteUniverseCmsEntry): void {
  const locale = entry.locale
    ? `?locale=${encodeURIComponent(entry.locale)}`
    : "";
  router.navigateTo(
    `/collections/${encodeURIComponent(entry.collectionName)}/entries/${encodeURIComponent(entry.slug)}${locale}`,
  );
}

function focusStream(edge: SiteUniverseEdge): void {
  const target = universe.value.nodes.find((node) => node.id === edge.to);
  if (target) focusPage("stream", target.slug);
}

function clearStreamFocus(): void {
  clearFocus("stream");
}

function syncNodeFocus(): void {
  const activeId = focusedNodeId.value ?? hoveredNodeId.value;
  if (!activeId) {
    clearFocus("node");
    return;
  }

  const node = universe.value.nodes.find((entry) => entry.id === activeId);
  if (node) focusPage("node", node.slug);
  else clearFocus("node");
}

function focusNodeHover(node: SiteUniverseNode): void {
  hoveredNodeId.value = node.id;
  focusPage("node", node.slug);
}

function clearNodeHover(): void {
  hoveredNodeId.value = null;
  syncNodeFocus();
}

function focusNodeKeyboard(node: SiteUniverseNode): void {
  focusedNodeId.value = node.id;
  focusPage("node", node.slug);
}

function clearNodeKeyboardFocus(): void {
  focusedNodeId.value = null;
  syncNodeFocus();
}

function openStreamPage(edge: SiteUniverseEdge): void {
  const target = universe.value.nodes.find((node) => node.id === edge.to);
  if (target) openPage(target);
}

function updatePointerPosition(): void {
  pointerFrame = null;
  const element = universeElement.value;
  const event = pendingPointerEvent;
  if (!element || !event) return;

  const rect = element.getBoundingClientRect();
  const isInside =
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom;

  pointer.value = isInside
    ? {
        x: ((event.clientX - rect.left) / rect.width) * 100,
        y: ((event.clientY - rect.top) / rect.height) * 100,
        active: true,
      }
    : { x: 50, y: 50, active: false };
}

function handlePointerMove(event: PointerEvent): void {
  pendingPointerEvent = event;
  if (pointerFrame !== null) return;
  pointerFrame = window.requestAnimationFrame(updatePointerPosition);
}

function resetPointer(): void {
  pointer.value = { x: 50, y: 50, active: false };
}

onMounted(() => {
  window.addEventListener("pointermove", handlePointerMove, { passive: true });
  window.addEventListener("blur", resetPointer);
});

onBeforeUnmount(() => {
  window.removeEventListener("pointermove", handlePointerMove);
  window.removeEventListener("blur", resetPointer);
  if (pointerFrame !== null) window.cancelAnimationFrame(pointerFrame);
  if (navigationTimer !== null) window.clearTimeout(navigationTimer);
  clearFocus("node");
  clearFocus("stream");
});
</script>

<template>
  <div
    ref="universeElement"
    class="site-universe absolute inset-0 overflow-clip rounded-[inherit]"
  >
    <svg
      v-if="hasUniverse"
      class="site-universe__svg"
      :class="{ 'site-universe__svg--active': activeNodeId }"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <g class="site-universe__edges" aria-hidden="true">
        <g
          v-for="edge in universe.edges"
          :key="edge.id"
          :class="edgeClass(edge)"
          :style="{
            '--edge-opacity': edge.opacity,
            '--edge-duration': `${edge.durationMs}ms`,
            '--edge-delay': `${edge.delayMs}ms`,
          }"
        >
          <path class="site-universe-edge__base" :d="edge.path" />
          <path
            v-if="edge.motion !== 'still'"
            class="site-universe-edge__flow"
            :d="edge.path"
          />
          <circle
            v-if="packetEdgeIds.has(edge.id)"
            class="site-universe-edge__packet"
            cx="0"
            cy="0"
            r="0.18"
          >
            <animateMotion
              :path="edge.path"
              :dur="`${Math.round(edge.durationMs * 1.05)}ms`"
              :begin="`-${edge.delayMs}ms`"
              :keyPoints="edge.direction === 'inbound' ? '1;0' : '0;1'"
              keyTimes="0;1"
              calcMode="linear"
              repeatCount="indefinite"
            />
          </circle>
        </g>
      </g>
    </svg>

    <svg
      v-if="hasUniverse"
      class="site-universe__hit-layer"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        v-for="edge in universe.edges"
        :key="`hit:${edge.id}`"
        class="site-universe-edge__hit-target"
        :d="edge.path"
        @pointerenter="focusStream(edge)"
        @pointerleave="clearStreamFocus"
        @click="openStreamPage(edge)"
      />
    </svg>

    <div
      class="site-universe__nodes"
      :class="{ 'site-universe__nodes--active': activeNodeId }"
      role="group"
      :aria-label="t('dashboard.universe.aria')"
    >
      <div
        class="site-universe-core"
        role="img"
        :aria-label="t('dashboard.universe.coreAria', { title: siteTitle })"
      >
        <span class="site-universe-core__glow" />
        <span
          class="site-universe-core__ring site-universe-core__ring--outer"
        />
        <span
          class="site-universe-core__ring site-universe-core__ring--inner"
        />
        <span class="site-universe-core__label">{{ siteTitle }}</span>
        <span class="site-universe-core__caption">SITE CORE</span>
      </div>

      <div class="site-universe__cms-layer">
        <div
          v-for="system in universe.cmsSystems"
          :key="system.id"
          class="site-universe-cms-system"
          :style="cmsSystemStyle(system)"
        >
          <button
            type="button"
            class="site-universe-cms-system__anchor"
            :aria-label="
              t('dashboard.universe.collectionAria', {
                title: system.label,
                count: system.itemCount,
              })
            "
            @click="openCollection(system)"
          >
            <span class="site-universe-cms-system__diamond" />
            <span class="site-universe-cms-system__label">
              <strong>{{ system.label }}</strong>
              <span>{{ system.itemCount }}</span>
            </span>
          </button>

          <span
            v-for="entry in system.entries"
            :key="entry.id"
            class="site-universe-cms-entry"
            :style="cmsEntryStyle(entry)"
          >
            <span class="site-universe-cms-entry__spoke" />
            <button
              type="button"
              :class="[
                'site-universe-cms-entry__node',
                `site-universe-cms-entry__node--${entry.status}`,
              ]"
              :aria-label="
                t('dashboard.universe.entryAria', {
                  title: entry.title,
                  status: statusLabel(entry.status),
                  collection: system.label,
                })
              "
              @click="openCmsEntry(entry)"
            >
              <span class="site-universe-cms-entry__label">{{
                entry.title
              }}</span>
            </button>
          </span>
        </div>
      </div>

      <button
        v-for="satellite in universe.satellites"
        :key="satellite.id"
        type="button"
        :class="[
          'site-universe-satellite',
          `site-universe-satellite--${satellite.source}`,
          `site-universe-satellite--${satellite.band}`,
        ]"
        :style="satelliteStyle(satellite)"
        :aria-label="
          t('dashboard.universe.componentAria', { title: satellite.title })
        "
        :title="
          t('dashboard.universe.componentTitle', { title: satellite.title })
        "
        @click="openComponent(satellite)"
      >
        <span class="site-universe-satellite__orbit-ring" />
        <span class="site-universe-satellite__core" />
        <span class="site-universe-satellite__label" aria-hidden="true">
          <span>{{ satellite.title }}</span>
          <span>{{ t("dashboard.universe.component") }}</span>
        </span>
      </button>

      <button
        v-for="node in universe.nodes"
        :key="node.id"
        type="button"
        :class="nodeClass(node)"
        :style="nodeStyle(node)"
        :aria-label="`${node.title}, ${statusLabel(node.status)}`"
        :title="`${node.title} - ${statusLabel(node.status)}`"
        @click="openPage(node)"
        @mouseenter="focusNodeHover(node)"
        @mouseleave="clearNodeHover"
        @focus="focusNodeKeyboard(node)"
        @blur="clearNodeKeyboardFocus"
      >
        <span class="site-universe-node__sway">
          <span class="site-universe-node__body">
            <span
              v-if="node.role === 'home'"
              class="site-universe-node__halo"
            />
            <span
              v-if="
                node.role === 'home' ||
                node.isRecent ||
                node.attention !== 'none'
              "
              class="site-universe-node__ring"
            />
            <span class="site-universe-node__core" />
            <span
              v-if="node.role === 'home'"
              :class="[studioIcons.home, 'site-universe-node__home-glyph']"
            />
            <span v-else class="site-universe-node__dot" />
            <span :class="labelClass(node)" aria-hidden="true">
              <span class="site-universe-node__title">{{ node.title }}</span>
              <span class="site-universe-node__status">
                {{ statusLabel(node.status) }}
              </span>
            </span>
          </span>
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.site-universe {
  color: var(--primary);
  container-type: size;
  pointer-events: none;
}

.site-universe::before {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse at 50% 50%,
    color-mix(in oklch, var(--primary) 8%, transparent) 0%,
    transparent 64%
  );
  content: "";
  pointer-events: none;
}

.site-universe__svg {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  display: block;
  overflow: hidden;
  opacity: 0.9;
  -webkit-mask-image: radial-gradient(
    ellipse at 50% 50%,
    black 0%,
    black 58%,
    transparent 96%
  );
  mask-image: radial-gradient(
    ellipse at 50% 50%,
    black 0%,
    black 58%,
    transparent 96%
  );
}

.site-universe__nodes {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
}

.site-universe-core {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 4;
  width: 116px;
  height: 116px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  pointer-events: none;
  transform: translate(-50%, -50%);
}

.site-universe-core__glow {
  position: absolute;
  inset: -38%;
  border-radius: inherit;
  background: radial-gradient(
    circle,
    color-mix(in oklch, var(--primary) 28%, transparent),
    color-mix(in oklch, var(--primary) 8%, transparent) 44%,
    transparent 72%
  );
  opacity: 0.62;
}

.site-universe-core__ring {
  position: absolute;
  border: 1px solid color-mix(in oklch, var(--primary) 42%, transparent);
  border-radius: inherit;
}

.site-universe-core__ring--outer {
  inset: 7px;
  border-style: dashed;
  opacity: 0.52;
  animation: siteUniverseCoreSpin 36s linear infinite;
}

.site-universe-core__ring--inner {
  inset: 22px;
  background: color-mix(in oklch, var(--background) 82%, transparent);
  box-shadow:
    inset 0 0 24px color-mix(in oklch, var(--primary) 11%, transparent),
    0 0 28px color-mix(in oklch, var(--primary) 13%, transparent);
}

.site-universe-core__label,
.site-universe-core__caption {
  position: absolute;
  z-index: 1;
  max-width: 80px;
  overflow: hidden;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-universe-core__label {
  color: color-mix(in oklch, var(--foreground) 92%, var(--primary) 8%);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.site-universe-core__caption {
  top: calc(50% + 14px);
  color: color-mix(in oklch, var(--primary) 66%, var(--muted-foreground) 34%);
  font-size: 7px;
  font-weight: 600;
  letter-spacing: 0.16em;
}

.site-universe__cms-layer {
  position: absolute;
  inset: 4%;
  z-index: 1;
  pointer-events: none;
}

.site-universe-cms-system {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 1px;
  height: 1px;
  pointer-events: none;
  transform: translate(-50%, -50%) scaleY(0.78) rotate(var(--cms-angle))
    translateX(min(43cqi, 45cqb)) rotate(var(--cms-angle-negative))
    scaleY(1.282);
  animation: siteUniverseCmsOrbit var(--cms-duration) linear infinite;
  animation-delay: var(--cms-phase);
}

.site-universe-cms-system:hover,
.site-universe-cms-system:focus-within,
.site-universe-cms-system:hover .site-universe-cms-entry,
.site-universe-cms-system:focus-within .site-universe-cms-entry,
.site-universe-cms-system:hover .site-universe-cms-entry__node,
.site-universe-cms-system:focus-within .site-universe-cms-entry__node {
  animation-play-state: paused;
}

.site-universe-cms-system__anchor {
  position: absolute;
  inset: -20px;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  outline: none;
  pointer-events: auto;
}

.site-universe-cms-system__diamond {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 11px;
  height: 11px;
  border: 1px solid
    color-mix(in oklch, var(--primary) 62%, var(--foreground) 16%);
  border-radius: 3px;
  background: color-mix(in oklch, var(--background) 64%, var(--primary) 36%);
  box-shadow: 0 0 12px color-mix(in oklch, var(--primary) 20%, transparent);
  transform: translate(-50%, -50%) rotate(45deg);
}

.site-universe-cms-system__anchor:focus-visible
  .site-universe-cms-system__diamond,
.site-universe-cms-system__anchor:hover .site-universe-cms-system__diamond {
  border-color: color-mix(in oklch, var(--primary) 82%, white 18%);
  background: color-mix(in oklch, var(--primary) 72%, white 8%);
}

.site-universe-cms-system__label {
  position: absolute;
  top: calc(50% + 13px);
  left: 50%;
  width: max-content;
  max-width: 130px;
  display: flex;
  gap: 5px;
  color: color-mix(in oklch, var(--foreground) 76%, transparent);
  font-size: 8px;
  line-height: 1;
  transform: translateX(-50%);
  white-space: nowrap;
}

.site-universe-cms-system__label strong {
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
}

.site-universe-cms-system__label span {
  color: color-mix(in oklch, var(--primary) 62%, var(--muted-foreground) 38%);
}

.site-universe-cms-entry {
  position: absolute;
  top: 0;
  left: 0;
  width: 1px;
  height: 1px;
  pointer-events: none;
  animation: siteUniverseEntryOrbit var(--entry-duration) linear infinite
    reverse;
  animation-delay: var(--entry-phase);
}

.site-universe-cms-entry__spoke {
  position: absolute;
  top: 0;
  left: 0;
  width: var(--entry-radius);
  border-top: 1px dashed color-mix(in oklch, var(--primary) 26%, transparent);
  opacity: 0.55;
  transform-origin: left center;
}

.site-universe-cms-entry__node {
  position: absolute;
  top: calc(var(--entry-size) / -2);
  left: calc(var(--entry-radius) - var(--entry-size) / 2);
  width: var(--entry-size);
  height: var(--entry-size);
  padding: 0;
  border: 1px solid color-mix(in oklch, var(--primary) 46%, transparent);
  border-radius: 1px;
  background: color-mix(in oklch, var(--background) 58%, var(--primary) 42%);
  cursor: pointer;
  outline: none;
  pointer-events: auto;
  animation: siteUniverseEntryCounterOrbit var(--entry-duration) linear infinite;
  animation-delay: var(--entry-phase);
}

.site-universe-cms-entry__node--draft {
  opacity: 0.54;
}

.site-universe-cms-entry__node--scheduled {
  border-color: color-mix(in oklch, var(--primary) 48%, orange 52%);
}

.site-universe-cms-entry__node--archived {
  opacity: 0.3;
}

.site-universe-cms-entry__label {
  position: absolute;
  left: calc(100% + 5px);
  top: 50%;
  width: max-content;
  max-width: 120px;
  overflow: hidden;
  color: color-mix(in oklch, var(--foreground) 82%, transparent);
  font-size: 8px;
  opacity: 0;
  text-overflow: ellipsis;
  transform: translateY(-50%);
  transition: opacity 140ms ease;
  white-space: nowrap;
}

.site-universe-cms-system:hover .site-universe-cms-entry__label,
.site-universe-cms-system:focus-within .site-universe-cms-entry__label {
  opacity: 1;
}

.site-universe__hit-layer {
  position: absolute;
  inset: 0;
  z-index: 2;
  width: 100%;
  height: 100%;
  overflow: hidden;
  pointer-events: none;
}

.site-universe-edge__hit-target {
  fill: none;
  stroke: transparent;
  stroke-width: 12;
  cursor: pointer;
  pointer-events: stroke;
  vector-effect: non-scaling-stroke;
}

.site-universe-edge__base,
.site-universe-edge__flow {
  fill: none;
  vector-effect: non-scaling-stroke;
  transition:
    stroke 180ms ease,
    stroke-opacity 180ms ease;
}

.site-universe-edge__base {
  stroke: color-mix(in oklch, var(--foreground) 26%, transparent);
  stroke-width: 0.7;
  stroke-opacity: var(--edge-opacity, 0.24);
}

.site-universe-edge__flow {
  stroke: color-mix(in oklch, var(--primary) 82%, white 8%);
  stroke-width: 1.2;
  stroke-linecap: round;
  stroke-dasharray: 1.8 118;
  stroke-dashoffset: 120;
  stroke-opacity: 0.42;
  animation: siteUniverseFlow var(--edge-duration, 8200ms) linear infinite;
  animation-delay: var(--edge-delay, 0ms);
}

.site-universe-edge--inbound .site-universe-edge__flow {
  animation-direction: reverse;
}

.site-universe-edge--pulse .site-universe-edge__flow {
  stroke-dasharray: 1.1 180;
  animation-name: siteUniversePulseFlow;
  animation-timing-function: ease-in-out;
}

.site-universe-edge__packet {
  fill: color-mix(in oklch, var(--primary) 74%, white 10%);
  filter: drop-shadow(
    0 0 1px color-mix(in oklch, var(--primary) 58%, transparent)
  );
  opacity: 0.46;
  vector-effect: non-scaling-stroke;
}

.site-universe__svg--active
  .site-universe-edge:not(.site-universe-edge--active) {
  opacity: 0.34;
}

.site-universe-edge--active .site-universe-edge__base {
  stroke: color-mix(in oklch, var(--primary) 64%, white 8%);
  stroke-opacity: 0.7;
}

.site-universe-edge--active .site-universe-edge__flow {
  stroke-width: 1.7;
  stroke-opacity: 1;
}

.site-universe-node {
  position: absolute;
  left: var(--node-x);
  top: var(--node-y);
  width: calc(var(--node-size) * 2.8);
  height: calc(var(--node-size) * 2.8);
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  cursor: pointer;
  pointer-events: auto;
  outline: none;
  transform: translate(-50%, -50%);
  transform-origin: center;
  animation: siteUniverseNodeIn 560ms cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: var(--node-delay, 0ms);
  transition: opacity 180ms ease;
}

.site-universe-node__body {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  border-radius: inherit;
  transform: translate(var(--node-pull-x, 0), var(--node-pull-y, 0));
  transition: transform 280ms cubic-bezier(0.16, 1, 0.3, 1);
}

.site-universe-node__sway {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  animation: siteUniverseNodeSway var(--node-sway-duration) ease-in-out infinite;
  animation-delay: var(--node-sway-delay);
}

.site-universe-node--home .site-universe-node__ring {
  inset: 2%;
  border-width: 1px;
  box-shadow: inset 0 0 0 3px
    color-mix(in oklch, var(--primary) 13%, transparent);
  opacity: 0.8;
}

.site-universe-node__home-glyph {
  position: absolute;
  z-index: 1;
  width: calc(var(--node-size) * 0.48);
  height: calc(var(--node-size) * 0.48);
  color: color-mix(in oklch, var(--foreground) 90%, var(--primary) 10%);
}

.site-universe__nodes--active
  .site-universe-node:not(.site-universe-node--active) {
  opacity: 0.5;
}

.site-universe__nodes--active .site-universe-node--related {
  opacity: 0.82;
}

.site-universe-node--active {
  z-index: 2;
}

.site-universe-node--departing::after {
  position: absolute;
  inset: 22%;
  border: 1px solid color-mix(in oklch, var(--primary) 80%, white 20%);
  border-radius: inherit;
  content: "";
  pointer-events: none;
  animation: siteUniverseDeparture 240ms ease-out both;
}

.site-universe-node--departing .site-universe-node__core {
  animation: siteUniverseDepartureCore 240ms ease-out both;
}

.site-universe-satellite {
  position: absolute;
  top: var(--satellite-center-y);
  left: var(--satellite-center-x);
  z-index: 1;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  cursor: pointer;
  outline: none;
  pointer-events: auto;
  transform: translate(-50%, -50%) rotate(var(--satellite-angle))
    translateX(var(--satellite-radius)) rotate(var(--satellite-angle-negative));
  animation: siteUniverseOrbit var(--satellite-duration) linear infinite;
  animation-delay: var(--satellite-phase);
}

.site-universe-satellite:hover,
.site-universe-satellite:focus-visible {
  z-index: 3;
  animation-play-state: paused;
}

.site-universe-satellite__orbit-ring {
  position: absolute;
  inset: 7px;
  border: 1px solid color-mix(in oklch, var(--primary) 42%, transparent);
  border-radius: inherit;
  opacity: 0.44;
  transition:
    inset 160ms ease,
    opacity 160ms ease;
}

.site-universe-satellite__core {
  position: absolute;
  top: 50%;
  left: 50%;
  width: var(--satellite-size);
  height: var(--satellite-size);
  border: 1px solid color-mix(in oklch, var(--primary) 82%, white 8%);
  border-radius: 2px;
  background: color-mix(in oklch, var(--primary) 58%, var(--background) 42%);
  box-shadow: 0 0 10px color-mix(in oklch, var(--primary) 28%, transparent);
  transform: translate(-50%, -50%) rotate(45deg);
  transition:
    background 160ms ease,
    transform 160ms ease;
}

.site-universe-satellite--aria {
  opacity: 0.58;
}

.site-universe-satellite--far {
  opacity: 0.72;
}

.site-universe-satellite--far .site-universe-satellite__orbit-ring {
  border-style: dashed;
  opacity: 0.28;
}

.site-universe-satellite__label {
  position: absolute;
  top: 50%;
  left: calc(100% + 4px);
  width: max-content;
  max-width: 170px;
  display: flex;
  align-items: baseline;
  gap: 7px;
  padding: 5px 7px;
  border: 1px solid color-mix(in oklch, var(--border) 72%, transparent);
  border-radius: 4px;
  background: color-mix(in oklch, var(--background) 92%, transparent);
  box-shadow: 0 8px 22px color-mix(in oklch, black 20%, transparent);
  opacity: 0;
  pointer-events: none;
  transform: translate(2px, -50%) scale(0.96);
  transform-origin: left center;
  transition:
    opacity 140ms ease,
    transform 140ms ease;
  white-space: nowrap;
}

.site-universe-satellite__label span:first-child {
  overflow: hidden;
  color: color-mix(in oklch, var(--foreground) 92%, transparent);
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  text-overflow: ellipsis;
}

.site-universe-satellite__label span:last-child {
  color: color-mix(in oklch, var(--primary) 66%, var(--muted-foreground) 34%);
  font-size: 8px;
  font-weight: 500;
  line-height: 1;
  text-transform: uppercase;
}

.site-universe-satellite:hover .site-universe-satellite__orbit-ring,
.site-universe-satellite:focus-visible .site-universe-satellite__orbit-ring {
  inset: 4px;
  opacity: 0.88;
}

.site-universe-satellite:hover .site-universe-satellite__core,
.site-universe-satellite:focus-visible .site-universe-satellite__core {
  background: color-mix(in oklch, var(--primary) 82%, white 8%);
  transform: translate(-50%, -50%) rotate(135deg) scale(1.18);
}

.site-universe-satellite:hover .site-universe-satellite__label,
.site-universe-satellite:focus-visible .site-universe-satellite__label {
  opacity: 1;
  transform: translate(6px, -50%) scale(1);
}

.site-universe-node__halo {
  position: absolute;
  inset: -35%;
  border-radius: inherit;
  background: radial-gradient(
    circle,
    color-mix(in oklch, var(--primary) 48%, transparent) 0%,
    color-mix(in oklch, var(--primary) 14%, transparent) 48%,
    transparent 72%
  );
  opacity: 0.28;
  animation: siteUniverseBreathe 8.5s ease-in-out infinite;
}

.site-universe-node__ring {
  position: absolute;
  inset: 12%;
  border-radius: inherit;
  border: 1px solid color-mix(in oklch, var(--primary) 78%, white 12%);
  opacity: 0.42;
  animation: siteUniverseRing 5.5s ease-in-out infinite;
}

.site-universe-node__core {
  position: absolute;
  width: var(--node-size);
  height: var(--node-size);
  border-radius: inherit;
  background: color-mix(in oklch, var(--primary) 62%, transparent);
  border: 1px solid color-mix(in oklch, var(--primary) 78%, white 12%);
  box-shadow: 0 0 18px color-mix(in oklch, var(--primary) 30%, transparent);
  transition:
    background 160ms ease,
    border-color 160ms ease,
    transform 160ms ease;
}

.site-universe-node__dot {
  position: absolute;
  width: calc(var(--node-size) * 0.42);
  height: calc(var(--node-size) * 0.42);
  min-width: 2px;
  min-height: 2px;
  border-radius: inherit;
  background: color-mix(in oklch, var(--foreground) 88%, var(--primary) 12%);
  opacity: 0.86;
  transition: opacity 160ms ease;
}

.site-universe-node__label {
  position: absolute;
  top: 50%;
  left: calc(50% + var(--node-size) * 1.25);
  width: max-content;
  max-width: 180px;
  display: flex;
  align-items: baseline;
  gap: 7px;
  padding: 5px 7px;
  border: 1px solid color-mix(in oklch, var(--border) 72%, transparent);
  border-radius: 4px;
  background: color-mix(in oklch, var(--background) 90%, transparent);
  box-shadow: 0 8px 24px color-mix(in oklch, black 22%, transparent);
  opacity: 0;
  pointer-events: none;
  transform: translate(4px, -50%) scale(0.96);
  transform-origin: left center;
  transition:
    opacity 140ms ease,
    transform 140ms ease;
  white-space: nowrap;
}

.site-universe-node__label--left {
  right: calc(50% + var(--node-size) * 1.25);
  left: auto;
  transform: translate(-4px, -50%) scale(0.96);
  transform-origin: right center;
}

.site-universe-node__label--above {
  top: auto;
  bottom: calc(50% + var(--node-size) * 1.15);
  transform: translate(4px, -4px) scale(0.96);
}

.site-universe-node__label--left.site-universe-node__label--above {
  transform: translate(-4px, -4px) scale(0.96);
}

.site-universe-node__title {
  overflow: hidden;
  color: color-mix(in oklch, var(--foreground) 92%, transparent);
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  text-overflow: ellipsis;
}

.site-universe-node__status {
  color: color-mix(in oklch, var(--muted-foreground) 78%, transparent);
  font-size: 8px;
  font-weight: 500;
  line-height: 1;
  text-transform: uppercase;
}

.site-universe-node--published .site-universe-node__status {
  color: color-mix(in oklch, var(--primary) 72%, var(--foreground) 28%);
}

.site-universe-node--draft .site-universe-node__status,
.site-universe-node--warning .site-universe-node__status {
  color: color-mix(in oklch, var(--primary) 38%, orange 62%);
}

.site-universe-node--home .site-universe-node__label,
.site-universe-node:hover .site-universe-node__label,
.site-universe-node:focus-visible .site-universe-node__label {
  opacity: 1;
  transform: translate(7px, -50%) scale(1);
}

.site-universe-node--home .site-universe-node__label--left,
.site-universe-node:hover .site-universe-node__label--left,
.site-universe-node:focus-visible .site-universe-node__label--left {
  transform: translate(-7px, -50%) scale(1);
}

.site-universe-node--home .site-universe-node__label--above,
.site-universe-node:hover .site-universe-node__label--above,
.site-universe-node:focus-visible .site-universe-node__label--above {
  transform: translate(7px, -7px) scale(1);
}

.site-universe-node--home
  .site-universe-node__label--left.site-universe-node__label--above,
.site-universe-node:hover
  .site-universe-node__label--left.site-universe-node__label--above,
.site-universe-node:focus-visible
  .site-universe-node__label--left.site-universe-node__label--above {
  transform: translate(-7px, -7px) scale(1);
}

.site-universe-node--draft .site-universe-node__core {
  background: color-mix(in oklch, var(--background) 72%, var(--primary) 28%);
  border-color: color-mix(in oklch, var(--primary) 46%, transparent);
}

.site-universe-node--archived {
  opacity: 0.32;
}

.site-universe-node--system .site-universe-node__core {
  background: color-mix(in oklch, var(--muted-foreground) 32%, transparent);
  border-color: color-mix(in oklch, var(--muted-foreground) 55%, transparent);
}

.site-universe-node--warning .site-universe-node__ring {
  border-color: color-mix(in oklch, var(--primary) 42%, orange 58%);
  opacity: 0.58;
}

.site-universe-node--error .site-universe-node__ring {
  border-color: color-mix(in oklch, red 65%, var(--primary) 35%);
  opacity: 0.72;
}

.site-universe-node--recent .site-universe-node__core {
  border-color: color-mix(in oklch, var(--primary) 88%, white 12%);
}

.site-universe-node:hover .site-universe-node__core,
.site-universe-node:focus-visible .site-universe-node__core {
  background: color-mix(in oklch, var(--primary) 82%, white 8%);
  border-color: color-mix(in oklch, var(--primary) 90%, white 10%);
  transform: scale(1.18);
}

.site-universe-node:hover .site-universe-node__dot,
.site-universe-node:focus-visible .site-universe-node__dot {
  opacity: 1;
}

.site-universe-node:focus-visible .site-universe-node__ring {
  border-color: color-mix(in oklch, var(--primary) 70%, white 30%);
  opacity: 0.95;
}

@keyframes siteUniverseFlow {
  from {
    stroke-dashoffset: 120;
  }
  to {
    stroke-dashoffset: 0;
  }
}

@keyframes siteUniverseCoreSpin {
  to {
    transform: rotate(1turn);
  }
}

@keyframes siteUniverseCmsOrbit {
  from {
    transform: translate(-50%, -50%) scaleY(0.78) rotate(var(--cms-angle))
      translateX(min(43cqi, 45cqb)) rotate(var(--cms-angle-negative))
      scaleY(1.282);
  }
  to {
    transform: translate(-50%, -50%) scaleY(0.78)
      rotate(calc(var(--cms-angle) + 1turn)) translateX(min(43cqi, 45cqb))
      rotate(calc(var(--cms-angle-negative) - 1turn)) scaleY(1.282);
  }
}

@keyframes siteUniverseEntryOrbit {
  from {
    transform: rotate(var(--entry-angle));
  }
  to {
    transform: rotate(calc(var(--entry-angle) + 1turn));
  }
}

@keyframes siteUniverseEntryCounterOrbit {
  from {
    transform: rotate(var(--entry-angle-negative));
  }
  to {
    transform: rotate(calc(var(--entry-angle-negative) + 1turn));
  }
}

@keyframes siteUniverseNodeSway {
  0%,
  100% {
    transform: translate(
      calc(var(--node-sway-x) * -0.55),
      calc(var(--node-sway-y) * 0.35)
    );
  }
  48% {
    transform: translate(var(--node-sway-x), calc(var(--node-sway-y) * -1));
  }
  72% {
    transform: translate(calc(var(--node-sway-x) * 0.1), var(--node-sway-y));
  }
}

@keyframes siteUniversePulseFlow {
  0%,
  18% {
    stroke-dashoffset: 180;
    stroke-opacity: 0;
  }
  42% {
    stroke-opacity: 0.52;
  }
  78% {
    stroke-opacity: 0.16;
  }
  100% {
    stroke-dashoffset: 0;
    stroke-opacity: 0;
  }
}

@keyframes siteUniverseOrbit {
  from {
    transform: translate(-50%, -50%) rotate(var(--satellite-angle))
      translateX(var(--satellite-radius))
      rotate(var(--satellite-angle-negative));
  }
  to {
    transform: translate(-50%, -50%)
      rotate(calc(var(--satellite-angle) + 1turn))
      translateX(var(--satellite-radius))
      rotate(calc(var(--satellite-angle-negative) - 1turn));
  }
}

@keyframes siteUniverseDeparture {
  from {
    opacity: 0.9;
    transform: scale(0.7);
  }
  to {
    opacity: 0;
    transform: scale(3.4);
  }
}

@keyframes siteUniverseDepartureCore {
  0% {
    filter: brightness(1);
    transform: scale(1);
  }
  55% {
    filter: brightness(1.8);
    transform: scale(1.35);
  }
  100% {
    filter: brightness(1.15);
    transform: scale(0.92);
  }
}

@keyframes siteUniverseBreathe {
  0%,
  100% {
    opacity: 0.2;
    transform: scale(0.94);
  }
  50% {
    opacity: 0.38;
    transform: scale(1.06);
  }
}

@keyframes siteUniverseRing {
  0%,
  100% {
    opacity: 0.36;
    transform: scale(0.92);
  }
  50% {
    opacity: 0.82;
    transform: scale(1.08);
  }
}

@keyframes siteUniverseNodeIn {
  from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.72);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .site-universe-edge__flow,
  .site-universe-edge__packet,
  .site-universe-node,
  .site-universe-node__halo,
  .site-universe-node__ring,
  .site-universe-node__sway,
  .site-universe-core__ring--outer,
  .site-universe-cms-system,
  .site-universe-cms-entry,
  .site-universe-cms-entry__node,
  .site-universe-node--departing::after,
  .site-universe-node--departing .site-universe-node__core,
  .site-universe-satellite {
    animation: none;
  }

  .site-universe-node__body {
    transform: none;
    transition: none;
  }
}
</style>
