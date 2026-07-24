import { resolveRenderableContentValue } from "../../../../lib/cms/structuredText";

export interface ResolvedLiveHeadingUpdate {
  level: number;
  text: string;
  hasExplicitText: boolean;
}

export function resolveLiveTextValue(
  props: Record<string, unknown>,
): string | null {
  const hasExplicitText =
    "content" in props || "text" in props || "label" in props;

  if (!hasExplicitText) {
    return null;
  }

  return resolveRenderableContentValue(
    props.content ?? props.text ?? props.label ?? "",
  );
}

function normalizeHeadingLevel(level: unknown, fallbackLevel: number): number {
  const resolvedLevel = Number(level);

  return Number.isInteger(resolvedLevel) &&
    resolvedLevel >= 1 &&
    resolvedLevel <= 6
    ? resolvedLevel
    : fallbackLevel;
}

function getHeadingLevelFromTagName(tagName?: string | null): number | null {
  if (!tagName) {
    return null;
  }

  const match = /^h([1-6])$/i.exec(tagName.trim());
  return match ? Number(match[1]) : null;
}

export function resolveLiveHeadingUpdate(
  props: Record<string, unknown>,
  options: {
    existingTagName?: string | null;
    existingText?: string | null;
    defaultLevel?: number;
  } = {},
): ResolvedLiveHeadingUpdate {
  const fallbackLevel = normalizeHeadingLevel(options.defaultLevel ?? 2, 2);
  const existingLevel =
    getHeadingLevelFromTagName(options.existingTagName) ?? fallbackLevel;
  const hasExplicitLevel = "level" in props;
  const hasExplicitText =
    "content" in props || "text" in props || "label" in props;
  const nextText = resolveLiveTextValue(props);

  return {
    level: hasExplicitLevel
      ? normalizeHeadingLevel(props.level, existingLevel)
      : existingLevel,
    text: nextText ?? String(options.existingText ?? ""),
    hasExplicitText,
  };
}
