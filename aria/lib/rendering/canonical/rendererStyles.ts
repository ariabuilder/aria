import { z } from "zod";

import type { BuilderNode } from "../../types/nodes";
import { readComposerResponsiveImage } from "../../media/composerReference";
import { buildResponsiveSrcSet } from "../../media/transforms/responsive";
import { sha256Text } from "./hash";

export const ARIA_MANAGED_IMAGE_CLASS = "aria-managed-image";
export const RENDERER_BASE_CONTRACT_VERSION =
  "rendering-v2.renderer-base.v1" as const;

export const RendererStyleRequirementSchema = z.enum([
  "managed-image-intrinsic-ratio",
]);
export type RendererStyleRequirement = z.infer<
  typeof RendererStyleRequirementSchema
>;

export const RendererBaseStyleFragmentSchema = z
  .object({
    kind: z.literal("renderer-base"),
    contractVersion: z.literal(RENDERER_BASE_CONTRACT_VERSION),
    provenance: z.literal("aria-renderer"),
    requirements: z.array(RendererStyleRequirementSchema).nonempty(),
    css: z.string().min(1),
    hash: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();

export type RendererBaseStyleFragment = z.infer<
  typeof RendererBaseStyleFragmentSchema
>;

export const RendererStyleBandsSchema = z
  .object({
    rendererBaseCss: z.string(),
    documentCss: z.string(),
    utilityCss: z.string(),
    customClassesCss: z.string(),
    contextRulesCss: z.string(),
    nodeCss: z.string(),
  })
  .strict();
export type RendererStyleBands = z.infer<typeof RendererStyleBandsSchema>;

const RENDERER_BASE_CSS_BY_REQUIREMENT = {
  "managed-image-intrinsic-ratio": `:where(img.${ARIA_MANAGED_IMAGE_CLASS}) {
  width: auto;
  height: auto;
}`,
} as const satisfies Record<RendererStyleRequirement, string>;

const REGISTERED_RENDERER_BASE_CSS = Object.values(
  RENDERER_BASE_CSS_BY_REQUIREMENT,
).sort((left, right) => right.length - left.length);

export type CompatibilityRendererBaseCssSplit = {
  rendererBaseCss: string;
  remainingCss: string;
};

/**
 * Separates a legacy persisted renderer band from the CSS that follows it.
 * Only byte-exact, registered Aria fragments at offset zero are recognized.
 */
export function splitCompatibilityRendererBaseCss(
  css: string,
): CompatibilityRendererBaseCssSplit {
  for (const registeredCss of REGISTERED_RENDERER_BASE_CSS) {
    if (css === registeredCss) {
      return { rendererBaseCss: registeredCss, remainingCss: "" };
    }

    const prefix = `${registeredCss}\n\n`;
    if (css.startsWith(prefix)) {
      return {
        rendererBaseCss: registeredCss,
        remainingCss: css.slice(prefix.length),
      };
    }
  }

  return { rendererBaseCss: "", remainingCss: css };
}

function normalizeRequirements(
  input: Iterable<RendererStyleRequirement>,
): RendererStyleRequirement[] {
  const requirements = Array.from(new Set(input));
  return RendererStyleRequirementSchema.options.filter((requirement) =>
    requirements.includes(requirement),
  );
}

/** Builds deterministic renderer-owned CSS without user or runtime metadata. */
export function assembleRendererBaseCss(
  input: Iterable<RendererStyleRequirement>,
): string {
  return normalizeRequirements(input)
    .map((requirement) => RENDERER_BASE_CSS_BY_REQUIREMENT[requirement])
    .join("\n\n");
}

/** Assembles all canonical style bands in their fixed cascade order. */
export function assembleRendererStyleBands(input: RendererStyleBands): string {
  const bands = RendererStyleBandsSchema.parse(input);
  return [
    bands.rendererBaseCss,
    bands.documentCss,
    bands.utilityCss,
    bands.customClassesCss,
    bands.contextRulesCss,
    bands.nodeCss,
  ]
    .map((section) => section.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export async function buildRendererBaseStyleFragment(
  input: Iterable<RendererStyleRequirement>,
): Promise<RendererBaseStyleFragment | null> {
  const requirements = normalizeRequirements(input);
  if (requirements.length === 0) return null;

  const css = assembleRendererBaseCss(requirements);
  return RendererBaseStyleFragmentSchema.parse({
    kind: "renderer-base",
    contractVersion: RENDERER_BASE_CONTRACT_VERSION,
    provenance: "aria-renderer",
    requirements,
    css,
    hash: await sha256Text(css),
  });
}

export function collectRendererStyleRequirements(
  nodes: readonly BuilderNode[],
): Set<RendererStyleRequirement> {
  const requirements = new Set<RendererStyleRequirement>();

  const visit = (node: BuilderNode): void => {
    if (node.type?.toLowerCase() === "image") {
      const responsive = readComposerResponsiveImage(node.metadata);
      if (
        responsive &&
        buildResponsiveSrcSet({
          url: responsive.default.url,
          maxWidth: responsive.default.width,
          allowDerivatives: responsive.default.allowDerivatives,
        })
      ) {
        requirements.add("managed-image-intrinsic-ratio");
      }
    }

    node.children?.forEach(visit);
  };

  nodes.forEach(visit);
  return requirements;
}
