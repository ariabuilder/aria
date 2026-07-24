<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  watch,
} from "vue";

interface Props {
  squareSize?: number;
  gridGap?: number;
  flickerChance?: number;
  color?: string;
  accentColor?: string;
  accentChance?: number;
  accentMaxOpacity?: number;
  width?: number;
  height?: number;
  class?: HTMLAttributes["class"];
  maxOpacity?: number;
  reveal?: boolean;
  revealDuration?: number;
  revealStagger?: number;
  /** Which edge the reveal animation and glow emanate from. */
  revealOrigin?: "right" | "bottom";
}

const props = withDefaults(defineProps<Props>(), {
  squareSize: 4,
  gridGap: 6,
  flickerChance: 0.3,
  color: "rgb(0, 0, 0)",
  accentChance: 0.12,
  maxOpacity: 1.0,
  reveal: true,
  revealDuration: 0.45,
  revealStagger: 0.4,
  revealOrigin: "right",
});

const canvasRef = ref<HTMLCanvasElement | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);
const isInView = ref(false);
const canvasSize = ref({ width: 0, height: 0 });

interface GridParams {
  cols: number;
  rows: number;
  squares: Float32Array;
  squareScales: Float32Array;
  squareColors: Uint8Array;
  squareReveal: Float32Array;
  revealDelays: Float32Array;
  dpr: number;
}

const gridParams = shallowRef<GridParams | null>(null);
const rgbaPrefixes = ref({
  base: "rgba(128, 128, 128,",
  accent: "rgba(128, 128, 128,",
});

let lastCanvasWidth = 0;
let lastCanvasHeight = 0;
let themeObserver: MutationObserver | null = null;
let themeRefreshGeneration = 0;
const themeRevision = ref(0);

const resolvedColorKey = computed(
  () =>
    `${themeRevision.value}-${props.color}-${props.accentColor ?? ""}-${props.accentChance}-${canvasSize.value.width}-${canvasSize.value.height}`,
);

function resolveRgbaPrefix(color: string, container: HTMLElement): string {
  const probe = document.createElement("span");
  probe.style.display = "none";
  probe.style.color = color;
  container.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  container.removeChild(probe);

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "rgba(128, 128, 128,";

  ctx.fillStyle = resolved;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = Array.from(ctx.getImageData(0, 0, 1, 1).data);
  return `rgba(${r}, ${g}, ${b},`;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function assignSquare(
  squares: Float32Array,
  squareScales: Float32Array,
  squareColors: Uint8Array,
  index: number,
) {
  const useAccent =
    props.accentColor !== undefined && Math.random() < props.accentChance;

  squareColors[index] = useAccent ? 1 : 0;

  const opacityCap = useAccent
    ? (props.accentMaxOpacity ?? props.maxOpacity)
    : props.maxOpacity;

  const opacityCurve = useAccent ? 1.1 : 1.65;
  squares[index] = Math.pow(Math.random(), opacityCurve) * opacityCap;
  squareScales[index] = useAccent
    ? 0.55 + Math.random() * 0.48
    : 0.28 + Math.random() * 0.58;
}

function setupCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): GridParams {
  const dpr = window.devicePixelRatio || 1;
  const logicalWidth = Math.max(1, Math.floor(width));
  const logicalHeight = Math.max(1, Math.floor(height));

  canvas.width = Math.max(1, Math.round(logicalWidth * dpr));
  canvas.height = Math.max(1, Math.round(logicalHeight * dpr));
  canvas.style.width = "100%";
  canvas.style.height = "100%";

  const cell = props.squareSize + props.gridGap;
  const cols = Math.max(1, Math.ceil(logicalWidth / cell));
  const rows = Math.max(1, Math.ceil(logicalHeight / cell));
  const squares = new Float32Array(cols * rows);
  const squareScales = new Float32Array(cols * rows);
  const squareColors = new Uint8Array(cols * rows);
  const squareReveal = new Float32Array(cols * rows);
  const revealDelays = new Float32Array(cols * rows);

  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const index = i * rows + j;
      assignSquare(squares, squareScales, squareColors, index);

      squareReveal[index] = props.reveal ? 0 : 1;

      if (props.reveal) {
        if (props.revealOrigin === "bottom") {
          const rowFromBottom = rows - 1 - j;
          const rowSpread = rows > 1 ? rowFromBottom / (rows - 1) : 0;
          const colJitter = cols > 1 ? (i / (cols - 1)) * 0.08 : 0;
          revealDelays[index] = (rowSpread + colJitter) * props.revealStagger;
        } else {
          const colFromRight = cols - 1 - i;
          const colSpread = cols > 1 ? colFromRight / (cols - 1) : 0;
          const rowJitter = rows > 1 ? (j / (rows - 1)) * 0.08 : 0;
          revealDelays[index] = (colSpread + rowJitter) * props.revealStagger;
        }
      }
    }
  }

  return {
    cols,
    rows,
    squares,
    squareScales,
    squareColors,
    squareReveal,
    revealDelays,
    dpr,
  };
}

function updateSquares(
  squares: Float32Array,
  squareScales: Float32Array,
  squareColors: Uint8Array,
  deltaTime: number,
  revealComplete: boolean,
) {
  if (!revealComplete) return;

  for (let i = 0; i < squares.length; i++) {
    if (Math.random() < props.flickerChance * deltaTime) {
      assignSquare(squares, squareScales, squareColors, i);
    }
  }
}

function updateReveal(
  squareReveal: Float32Array,
  revealDelays: Float32Array,
  elapsed: number,
): boolean {
  let complete = true;

  for (let i = 0; i < squareReveal.length; i++) {
    const progress = (elapsed - revealDelays[i]) / props.revealDuration;
    const clamped = Math.min(Math.max(progress, 0), 1);
    squareReveal[i] = easeOutCubic(clamped);
    if (clamped < 1) complete = false;
  }

  return complete;
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  params: GridParams,
) {
  const { cols, rows, squares, squareScales, squareColors, dpr } = params;
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();

  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const index = i * rows + j;
      const opacity = squares[index] * params.squareReveal[index];
      const prefix =
        squareColors[index] === 1
          ? rgbaPrefixes.value.accent
          : rgbaPrefixes.value.base;
      const particleSize = Math.max(
        1,
        props.squareSize * squareScales[index] * dpr,
      );
      const cellSize = (props.squareSize + props.gridGap) * dpr;
      const x = i * cellSize + (props.squareSize * dpr - particleSize) / 2;
      const y = j * cellSize + (props.squareSize * dpr - particleSize) / 2;

      ctx.fillStyle = `${prefix}${opacity})`;
      ctx.fillRect(x, y, particleSize, particleSize);
    }
  }

  ctx.restore();
}

let animationFrameId: number | null = null;
let resizeObserver: ResizeObserver | null = null;
let intersectionObserver: IntersectionObserver | null = null;
let lastTime = 0;
let revealStartTime = 0;
let revealComplete = !props.reveal;

function getSizeHost(container: HTMLElement): HTMLElement {
  const clipHost = container.parentElement;
  return clipHost?.parentElement ?? clipHost ?? container;
}

function resolveColorPrefixes(container: HTMLElement) {
  rgbaPrefixes.value = {
    base: resolveRgbaPrefix(props.color, container),
    accent: resolveRgbaPrefix(props.accentColor ?? props.color, container),
  };
}

function reassignSquareColors(params: GridParams) {
  for (let i = 0; i < params.squares.length; i++) {
    assignSquare(params.squares, params.squareScales, params.squareColors, i);
  }
}

function refreshGridColors(container: HTMLElement) {
  resolveColorPrefixes(container);
  const params = gridParams.value;
  if (params) {
    reassignSquareColors(params);
  }
}

function applyGridAppearanceUpdate() {
  const canvas = canvasRef.value;
  const container = containerRef.value;
  if (!canvas || !container) return;

  if (gridParams.value && lastCanvasWidth > 0 && lastCanvasHeight > 0) {
    refreshGridColors(container);
    if (isInView.value) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        drawGrid(ctx, canvas.width, canvas.height, gridParams.value);
      }
      startAnimation();
    }
    return;
  }

  updateCanvasSize();
  if (isInView.value) {
    startAnimation();
  }
}

function scheduleThemeRevision() {
  themeRefreshGeneration += 1;
  const generation = themeRefreshGeneration;
  // Two frames so CSS variables settle after class / data-theme swaps.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (generation !== themeRefreshGeneration) return;
      themeRevision.value += 1;
    });
  });
}

function readContainerSize(container: HTMLElement): {
  width: number;
  height: number;
} {
  const rect = container.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    return { width: rect.width, height: rect.height };
  }

  const sizeHost = getSizeHost(container);
  return {
    width: sizeHost.clientWidth,
    height: sizeHost.clientHeight,
  };
}

function updateCanvasSize(width?: number, height?: number) {
  const canvas = canvasRef.value;
  const container = containerRef.value;
  if (!canvas || !container) return;

  const measured = readContainerSize(container);
  const newWidth = props.width ?? width ?? measured.width;
  const newHeight = props.height ?? height ?? measured.height;

  if (newWidth <= 0 || newHeight <= 0) return;

  const roundedWidth = Math.round(newWidth);
  const roundedHeight = Math.round(newHeight);
  const sizeUnchanged =
    roundedWidth === lastCanvasWidth && roundedHeight === lastCanvasHeight;

  if (sizeUnchanged && gridParams.value) {
    return;
  }

  canvasSize.value = { width: newWidth, height: newHeight };
  resolveColorPrefixes(container);

  lastCanvasWidth = roundedWidth;
  lastCanvasHeight = roundedHeight;
  gridParams.value = setupCanvas(canvas, newWidth, newHeight);
  revealComplete = !props.reveal;
  revealStartTime = 0;
  lastTime = 0;
}

function stopAnimation() {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  lastTime = 0;
}

function startAnimation() {
  const canvas = canvasRef.value;
  if (!canvas || !isInView.value) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  if (animationFrameId !== null) {
    return;
  }

  const shouldRunRevealIntro =
    props.reveal && gridParams.value && !revealComplete;

  if (shouldRunRevealIntro) {
    for (let i = 0; i < gridParams.value.squareReveal.length; i++) {
      gridParams.value.squareReveal[i] = 0;
    }
    revealStartTime = 0;
  }

  const animate = (time: number) => {
    if (!isInView.value || !gridParams.value) {
      stopAnimation();
      return;
    }

    if (!revealStartTime) {
      revealStartTime = time;
    }

    const deltaTime = lastTime ? (time - lastTime) / 1000 : 0;
    lastTime = time;

    if (!revealComplete && props.reveal) {
      const elapsed = (time - revealStartTime) / 1000;
      revealComplete = updateReveal(
        gridParams.value.squareReveal,
        gridParams.value.revealDelays,
        elapsed,
      );
    }

    updateSquares(
      gridParams.value.squares,
      gridParams.value.squareScales,
      gridParams.value.squareColors,
      deltaTime,
      revealComplete,
    );
    drawGrid(ctx, canvas.width, canvas.height, gridParams.value);
    animationFrameId = requestAnimationFrame(animate);
  };

  animationFrameId = requestAnimationFrame(animate);
}

onMounted(async () => {
  const canvas = canvasRef.value;
  const container = containerRef.value;
  if (!canvas || !container) return;

  await nextTick();
  updateCanvasSize();

  resizeObserver = new ResizeObserver(() => {
    updateCanvasSize();
  });

  const sizeHost = getSizeHost(container);
  resizeObserver.observe(sizeHost);
  if (container.parentElement && container.parentElement !== sizeHost) {
    resizeObserver.observe(container.parentElement);
  }
  resizeObserver.observe(container);

  intersectionObserver = new IntersectionObserver(
    ([entry]) => {
      isInView.value = entry.isIntersecting;
    },
    { threshold: 0 },
  );
  intersectionObserver.observe(canvas);

  requestAnimationFrame(() => {
    updateCanvasSize();
    if (isInView.value) {
      startAnimation();
    }
  });

  themeObserver = new MutationObserver(() => {
    scheduleThemeRevision();
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-theme"],
  });
});

onUnmounted(() => {
  stopAnimation();
  resizeObserver?.disconnect();
  intersectionObserver?.disconnect();
  themeObserver?.disconnect();
  themeObserver = null;
  themeRefreshGeneration += 1;
});

watch(isInView, (visible) => {
  if (visible) {
    startAnimation();
  } else {
    stopAnimation();
  }
});

watch(
  () => [
    props.squareSize,
    props.gridGap,
    props.maxOpacity,
    props.accentMaxOpacity,
    props.accentChance,
    props.width,
    props.height,
    props.reveal,
    props.revealDuration,
    props.revealStagger,
    props.revealOrigin,
    resolvedColorKey.value,
  ],
  () => {
    applyGridAppearanceUpdate();
  },
);
</script>

<template>
  <div
    ref="containerRef"
    :class="
      cn(
        'pointer-events-none absolute inset-0 size-full',
        props.revealOrigin === 'bottom' && 'flickering-grid-origin-bottom',
        props.class,
      )
    "
    aria-hidden="true"
  >
    <div class="flickering-grid-glow" />
    <canvas ref="canvasRef" class="flickering-grid-canvas" />
  </div>
</template>

<style scoped>
.flickering-grid-glow {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  --flickering-grid-glow: var(--flickering-grid-accent, var(--primary));
  /* Nav sidebars (settings, components) — keep glow minimal; dots carry the accent. */
  background:
    linear-gradient(
      to right,
      transparent 0%,
      transparent 72%,
      color-mix(in oklch, var(--flickering-grid-glow) 3%, transparent) 92%,
      color-mix(in oklch, var(--flickering-grid-glow) 7%, transparent) 100%
    ),
    radial-gradient(
      ellipse 55% 50% at 100% 50%,
      color-mix(in oklch, var(--flickering-grid-glow) 4%, transparent) 0%,
      transparent 52%
    );
}

.flickering-grid-canvas {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: block;
  width: 100%;
  height: 100%;
  margin-top: 2px;
}

.flickering-grid-origin-bottom .flickering-grid-glow {
  background:
    linear-gradient(
      to top,
      transparent 0%,
      transparent 55%,
      color-mix(in oklch, var(--flickering-grid-glow) 5%, transparent) 82%,
      color-mix(in oklch, var(--flickering-grid-glow) 10%, transparent) 100%
    ),
    radial-gradient(
      ellipse 80% 70% at 50% 100%,
      color-mix(in oklch, var(--flickering-grid-glow) 7%, transparent) 0%,
      transparent 62%
    );
}
</style>
