import type { CompiledIconRecord } from "./staticIconProvider";

export type ResolvedIconMap = ReadonlyMap<string, CompiledIconRecord>;

function safeIdPrefix(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 72) || "icon";
}

/** Scope SVG fragment identifiers for a single rendered occurrence. */
export function scopeIconBodyIds(body: string, instanceKey: string): string {
  const ids = new Map<string, string>();
  const prefix = `aria-icon-${safeIdPrefix(instanceKey)}-`;
  let sequence = 0;

  const withIds = body.replace(/\sid=(['"])([^'"]+)\1/gu, (_full, quote, id) => {
    const scoped = `${prefix}${sequence++}`;
    ids.set(id, scoped);
    return ` id=${quote}${scoped}${quote}`;
  });

  if (ids.size === 0) return withIds;

  return withIds
    .replace(/url\(#([^\)]+)\)/gu, (full, id) =>
      ids.has(id) ? `url(#${ids.get(id)})` : full,
    )
    .replace(/((?:xlink:)?href=['"])#([^'"]+)(['"])/gu, (full, start, id, end) =>
      ids.has(id) ? `${start}#${ids.get(id)}${end}` : full,
    );
}

/**
 * The caller owns attribute escaping. Renderer call-sites only pass attributes
 * assembled from already escaped DSL values.
 */
export function renderResolvedIconSvg(
  icon: CompiledIconRecord | undefined,
  attrs = "",
  instanceKey = "0",
): string | null {
  if (!icon) return null;
  const body = icon.hasInternalIds
    ? scopeIconBodyIds(icon.body, `${icon.contentHash}-${instanceKey}`)
    : icon.body;
  const attrText = attrs.trim();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${icon.viewBox}"${attrText ? ` ${attrText}` : ""}>${body}</svg>`;
}

/** Add renderer-owned attributes to a trusted API SVG and scope any fragment IDs. */
export function renderInlineIconSvg(
  svg: string,
  attrs = "",
  instanceKey = "0",
): string | null {
  const trimmed = svg.trim();
  if (!/^<svg\b[^>]*>/iu.test(trimmed)) return null;
  const scoped = /\sid=(['"])[^'"]+\1/iu.test(trimmed)
    ? scopeIconBodyIds(trimmed, instanceKey)
    : trimmed;
  const attrText = attrs.trim();
  return scoped.replace(/^<svg\b([^>]*)>/iu, (_full, existingAttrs) =>
    `<svg${existingAttrs}${attrText ? ` ${attrText}` : ""}>`,
  );
}

export function renderIconSvgRecord(icon: CompiledIconRecord): string {
  return renderResolvedIconSvg(icon, "", "api")!;
}
