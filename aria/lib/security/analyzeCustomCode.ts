import { z } from "zod";

export const CustomCodeSectionSchema = z.object({
  label: z.string().min(1),
  code: z.string().nullable().optional(),
});

export type CustomCodeSection = z.infer<typeof CustomCodeSectionSchema>;

export const CustomCodeAnalysisSchema = z.object({
  scriptSrc: z.array(z.string()),
  connectSrc: z.array(z.string()),
  imgSrc: z.array(z.string()),
  frameSrc: z.array(z.string()),
  fontSrc: z.array(z.string()),
  styleSrc: z.array(z.string()),
  mediaSrc: z.array(z.string()),
  inlineScripts: z.int().nonnegative(),
  inlineEventHandlers: z.int().nonnegative(),
  inlineStyles: z.int().nonnegative(),
  unknownPatterns: z.array(z.string()),
  warnings: z.array(z.string()),
});

export type CustomCodeAnalysis = z.infer<typeof CustomCodeAnalysisSchema>;

type SourceBucket =
  | "scriptSrc"
  | "connectSrc"
  | "imgSrc"
  | "frameSrc"
  | "fontSrc"
  | "styleSrc"
  | "mediaSrc";

type SourceMatch = {
  value: string;
  bucket: SourceBucket;
  label: string;
};

const EXTERNAL_SOURCE_PATTERNS: ReadonlyArray<{
  bucket: SourceBucket;
  label: string;
  regex: RegExp;
}> = [
  {
    bucket: "scriptSrc",
    label: "script src",
    regex: /<script\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi,
  },
  {
    bucket: "frameSrc",
    label: "iframe src",
    regex: /<iframe\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi,
  },
  {
    bucket: "styleSrc",
    label: "stylesheet href",
    regex:
      /<link\b(?=[^>]*\brel\s*=\s*(["'])stylesheet\1)[^>]*\bhref\s*=\s*(["'])(.*?)\2/gi,
  },
  {
    bucket: "imgSrc",
    label: "image src",
    regex: /<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi,
  },
  {
    bucket: "mediaSrc",
    label: "video src",
    regex: /<video\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi,
  },
  {
    bucket: "mediaSrc",
    label: "audio src",
    regex: /<audio\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi,
  },
  {
    bucket: "mediaSrc",
    label: "source src",
    regex: /<source\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi,
  },
];

function createEmptyAnalysis(): CustomCodeAnalysis {
  return {
    scriptSrc: [],
    connectSrc: [],
    imgSrc: [],
    frameSrc: [],
    fontSrc: [],
    styleSrc: [],
    mediaSrc: [],
    inlineScripts: 0,
    inlineEventHandlers: 0,
    inlineStyles: 0,
    unknownPatterns: [],
    warnings: [],
  };
}

function addUnique(target: string[], value: string): void {
  if (!target.includes(value)) {
    target.push(value);
  }
}

function normalizeSourceValue(rawValue: string): string | null {
  const value = rawValue.trim();
  if (!value) return null;

  if (
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith("?") ||
    value.startsWith("#")
  ) {
    return "'self'";
  }

  if (value.startsWith("//")) {
    try {
      return new URL(`https:${value}`).origin;
    } catch {
      return null;
    }
  }

  if (value.startsWith("data:")) return "data:";
  if (value.startsWith("blob:")) return "blob:";
  if (value.startsWith("javascript:")) return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function collectSourceMatches(code: string): SourceMatch[] {
  const matches: SourceMatch[] = [];

  for (const pattern of EXTERNAL_SOURCE_PATTERNS) {
    for (const match of code.matchAll(pattern.regex)) {
      const value = match.at(-1);
      if (!value) continue;
      matches.push({
        value,
        bucket: pattern.bucket,
        label: pattern.label,
      });
    }
  }

  return matches;
}

function countMatches(code: string, regex: RegExp): number {
  return Array.from(code.matchAll(regex)).length;
}

export function analyzeCustomCode(
  sections: readonly CustomCodeSection[],
): CustomCodeAnalysis {
  const parsedSections = z.array(CustomCodeSectionSchema).parse(sections);
  const analysis = createEmptyAnalysis();

  for (const section of parsedSections) {
    const code = section.code?.trim() ?? "";
    if (!code) continue;

    analysis.inlineScripts += countMatches(
      code,
      /<script\b(?![^>]*\bsrc\s*=)[^>]*>[\s\S]*?<\/script>/gi,
    );
    analysis.inlineEventHandlers += countMatches(code, /\son[a-z]+\s*=/gi);
    analysis.inlineStyles +=
      countMatches(code, /<style\b[^>]*>[\s\S]*?<\/style>/gi) +
      countMatches(code, /\sstyle\s*=/gi);

    for (const match of collectSourceMatches(code)) {
      const normalized = normalizeSourceValue(match.value);
      if (!normalized) {
        const warning = `${section.label}: invalid or unsupported ${match.label} value \"${match.value}\"`;
        addUnique(analysis.warnings, warning);
        addUnique(
          analysis.unknownPatterns,
          `${section.label}:${match.label}:${match.value}`,
        );
        continue;
      }

      addUnique(analysis[match.bucket], normalized);
    }

    if (/\b(fetch|XMLHttpRequest|sendBeacon|WebSocket)\b/.test(code)) {
      addUnique(
        analysis.warnings,
        `${section.label}: inline code may create additional runtime network requirements`,
      );
    }
  }

  if (analysis.inlineScripts > 0) {
    addUnique(
      analysis.warnings,
      "Inline custom scripts detected; published CSP will need a relaxed script execution posture.",
    );
  }

  if (analysis.inlineEventHandlers > 0) {
    addUnique(
      analysis.warnings,
      "Inline event handlers detected in custom code.",
    );
  }

  return CustomCodeAnalysisSchema.parse(analysis);
}
