import type { ResolvedIconMap } from "./renderResolvedIcon";
import {
  renderInlineIconSvg,
  renderResolvedIconSvg,
} from "./renderResolvedIcon";

/** Request-scoped icon map and deterministic SVG instance allocator. */
export interface IconRenderResources {
  icons: ResolvedIconMap;
  /** Trusted complete SVGs supplied by the browser icon-data API. */
  inlineSvgs?: ReadonlyMap<string, string>;
  metrics?: IconRenderMetrics;
  nextInstance: () => string;
}

export type IconRenderMetrics = {
  durationMs: number;
  requestedIconCount: number;
  assetReads?: number;
  manifestReads?: number;
  catalogReads?: number;
  shardReads?: number;
};

export function createIconRenderResources(
  icons: ResolvedIconMap,
  inlineSvgs?: ReadonlyMap<string, string>,
  metrics?: IconRenderMetrics,
): IconRenderResources {
  let instance = 0;
  return { icons, inlineSvgs, metrics, nextInstance: () => String(instance++) };
}

export function renderIconFromResources(
  resources: IconRenderResources | undefined,
  canonicalId: string,
  attrs = "",
): string | null {
  const instance = resources?.nextInstance();
  const compiled = renderResolvedIconSvg(
    resources?.icons.get(canonicalId),
    attrs,
    instance,
  );
  if (compiled) return compiled;

  const inlineSvg = resources?.inlineSvgs?.get(canonicalId);
  return inlineSvg
    ? renderInlineIconSvg(inlineSvg, attrs, instance)
    : null;
}
