import { z } from "zod";

import type { BreakpointDefinition } from "../../types/nodes";
import { readComposerResponsiveImage } from "../../media/composerReference";
import { buildResponsiveSrcSet } from "../../media/transforms/responsive";
import { createResponsiveMediaQuery } from "../../styles/responsiveBreakpoints";
import {
  CanonicalClassTokenSchema,
  type CanonicalClassToken,
} from "./classTokens";
import {
  ARIA_MANAGED_IMAGE_CLASS,
  RendererStyleRequirementSchema,
  type RendererStyleRequirement,
} from "./rendererStyles";

export const ManagedImageSourceProjectionSchema = z
  .object({
    media: z.string().trim().min(1),
    srcSet: z.string().trim().min(1),
    sizes: z.string().trim().min(1),
  })
  .strict();

export const ManagedImageProjectionSchema = z
  .object({
    width: z.number().int().positive(),
    height: z.number().int().positive().nullable(),
    srcSet: z.string().trim().min(1),
    sizes: z.string().trim().min(1),
    sources: z.array(ManagedImageSourceProjectionSchema),
    classToken: CanonicalClassTokenSchema,
    styleRequirements: z.array(RendererStyleRequirementSchema).nonempty(),
  })
  .strict();

export type ManagedImageSourceProjection = z.infer<
  typeof ManagedImageSourceProjectionSchema
>;
export type ManagedImageProjection = z.infer<
  typeof ManagedImageProjectionSchema
>;

const MANAGED_IMAGE_CLASS_TOKEN = CanonicalClassTokenSchema.parse({
  name: ARIA_MANAGED_IMAGE_CLASS,
  origin: "renderer",
}) satisfies CanonicalClassToken;

const MANAGED_IMAGE_STYLE_REQUIREMENTS = [
  "managed-image-intrinsic-ratio",
] as const satisfies readonly RendererStyleRequirement[];

function readQuery(query: string): {
  kind: "min" | "max" | "unknown";
  width: number;
} {
  const match = query.match(/(min|max)-width:\s*([\d.]+)px/u);
  if (!match) return { kind: "unknown", width: 0 };
  return {
    kind: match[1] === "min" ? "min" : "max",
    width: Number.parseFloat(match[2]),
  };
}

function compareSourceOrder(
  left: ManagedImageSourceProjection,
  right: ManagedImageSourceProjection,
): number {
  const leftQuery = readQuery(left.media);
  const rightQuery = readQuery(right.media);

  if (leftQuery.kind === rightQuery.kind) {
    if (leftQuery.kind === "min") return rightQuery.width - leftQuery.width;
    if (leftQuery.kind === "max") return leftQuery.width - rightQuery.width;
    return left.media.localeCompare(right.media);
  }
  if (leftQuery.kind === "max") return -1;
  if (rightQuery.kind === "max") return 1;
  return left.media.localeCompare(right.media);
}

/**
 * Projects Composer-owned responsive media into one portable render shape.
 * Invalid or unmanaged metadata fails closed and leaves the image untouched.
 */
export function projectManagedImage(input: {
  node: {
    type: string;
    metadata?: Record<string, unknown>;
  };
  breakpoints: readonly BreakpointDefinition[];
}): ManagedImageProjection | null {
  if (input.node.type?.toLowerCase() !== "image") return null;

  const responsive = readComposerResponsiveImage(input.node.metadata);
  if (!responsive) return null;

  const srcSet = buildResponsiveSrcSet({
    url: responsive.default.url,
    maxWidth: responsive.default.width,
    allowDerivatives: responsive.default.allowDerivatives,
  });
  if (!srcSet) return null;

  const sources = Object.entries(responsive.sources)
    .map(([breakpointName, source]): ManagedImageSourceProjection | null => {
      const media = createResponsiveMediaQuery(
        input.breakpoints,
        breakpointName,
      );
      const sourceSrcSet = buildResponsiveSrcSet({
        url: source.url,
        maxWidth: source.width,
        allowDerivatives: source.allowDerivatives,
      });
      return media && sourceSrcSet
        ? {
            media,
            srcSet: sourceSrcSet,
            sizes: responsive.sizes,
          }
        : null;
    })
    .filter((source): source is ManagedImageSourceProjection => source !== null)
    .sort(compareSourceOrder);

  return ManagedImageProjectionSchema.parse({
    width: responsive.default.width,
    height: responsive.default.height ?? null,
    srcSet,
    sizes: responsive.sizes,
    sources,
    classToken: MANAGED_IMAGE_CLASS_TOKEN,
    styleRequirements: MANAGED_IMAGE_STYLE_REQUIREMENTS,
  });
}

/** Applies the canonical managed-image projection to an existing image. */
export function materializeManagedImageDom(
  image: HTMLImageElement,
  input: ManagedImageProjection,
): HTMLImageElement | HTMLPictureElement {
  const projection = ManagedImageProjectionSchema.parse(input);
  image.classList.add(projection.classToken.name);
  if (!image.hasAttribute("width")) {
    image.setAttribute("width", String(projection.width));
  }
  if (projection.height !== null && !image.hasAttribute("height")) {
    image.setAttribute("height", String(projection.height));
  }
  image.setAttribute("srcset", projection.srcSet);
  image.setAttribute("sizes", projection.sizes);

  if (projection.sources.length === 0) return image;

  const picture = image.ownerDocument.createElement("picture");
  picture.style.display = "contents";
  projection.sources.forEach((sourceProjection) => {
    const source = image.ownerDocument.createElement("source");
    source.setAttribute("media", sourceProjection.media);
    source.setAttribute("srcset", sourceProjection.srcSet);
    source.setAttribute("sizes", sourceProjection.sizes);
    picture.appendChild(source);
  });
  picture.appendChild(image);
  return picture;
}
