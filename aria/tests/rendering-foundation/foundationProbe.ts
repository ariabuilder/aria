import { createGenerator, type UserConfig } from "@unocss/core";
import presetTypography from "@unocss/preset-typography";
import { presetWind3 } from "@unocss/preset-wind3";
import transformerVariantGroup from "@unocss/transformer-variant-group";
import { z } from "zod";

import {
  RENDER_ERROR_CODES,
  RenderRuntimeCapabilityMatrixSchema,
  createRenderFailure,
  hashCanonicalJson,
  observeRenderOperation,
  stableSerializeJson,
  type RenderFailure,
  type RenderOperationObservation,
  type RenderRuntimeCapabilityMatrix,
  type RenderRuntimeTarget,
} from "../../lib/rendering/canonical";

const FoundationNodeSchema = z
  .object({
    id: z.string().min(1),
    tag: z.enum(["main", "section", "h1", "p", "a"]),
    attributes: z.record(z.string(), z.string()),
    classes: z.array(z.string().min(1)),
    children: z.array(z.string()),
  })
  .strict();

const FoundationProbeInputSchema = z
  .object({
    contract: z.literal("aria-render-foundation@1"),
    surfaceId: z.string().min(1),
    locale: z.string().min(1),
    nodes: z.array(FoundationNodeSchema).min(1),
    documentHtml: z.string().min(1),
  })
  .strict();

const FOUNDATION_INPUT = {
  locale: "en-CA",
  surfaceId: "page:home@7",
  contract: "aria-render-foundation@1",
  nodes: [
    {
      tag: "main",
      id: "root",
      classes: ["grid", "gap-4", "md:grid-cols-2"],
      attributes: {
        "aria-label": "Foundation fixture",
        id: "content",
      },
      children: ["heading", "copy", "link"],
    },
    {
      tag: "h1",
      id: "heading",
      classes: ["text-3xl", "font-bold"],
      attributes: {},
      children: ["Rendering v2"],
    },
    {
      tag: "p",
      id: "copy",
      classes: ["prose", "text-slate-700"],
      attributes: {},
      children: ["Portable by construction."],
    },
    {
      tag: "a",
      id: "link",
      classes: ["btn-foundation"],
      attributes: {
        href: "/docs",
      },
      children: ["Read the plan"],
    },
  ],
  documentHtml:
    '<main id="content" aria-label="Foundation fixture" class="grid gap-4 md:grid-cols-2"><h1 class="text-3xl font-bold">Rendering v2</h1><p class="prose text-slate-700">Portable by construction.</p><a href="/docs" class="btn-foundation">Read the plan</a></main>',
} satisfies z.input<typeof FoundationProbeInputSchema>;

const PORTABLE_UNO_CONFIG = {
  presets: [
    presetWind3({
      dark: "class",
      preflights: {
        reset: true,
        theme: true,
      },
    }),
    presetTypography(),
  ],
  transformers: [transformerVariantGroup()],
  theme: {
    colors: {
      slate: {
        700: "#334155",
      },
    },
  },
  shortcuts: {
    "btn-foundation":
      "inline-flex items-center rounded bg-slate-700 px-4 py-2 text-white",
  },
  content: {
    inline: [],
    pipeline: false,
  },
} satisfies UserConfig;

export const FoundationProbeResultSchema = z
  .object({
    normalizedInput: z.string().min(1),
    inputHash: z.string().regex(/^[a-f0-9]{64}$/u),
    documentHash: z.string().regex(/^[a-f0-9]{64}$/u),
    stylesheetHash: z.string().regex(/^[a-f0-9]{64}$/u),
    css: z.string().min(1),
    failures: z.array(
      z
        .object({
          code: z.enum(RENDER_ERROR_CODES),
          message: z.string().min(1),
        })
        .strict(),
    ),
  })
  .strict();
export type FoundationProbeResult = z.infer<
  typeof FoundationProbeResultSchema
>;

export const FOUNDATION_CAPABILITY_MATRICES = [
  {
    runtime: "node",
    capabilities: {
      storage: {
        status: "available",
        provider: "sqlite",
        ownerPhase: null,
      },
      resources: {
        status: "available",
        provider: "local-static",
        ownerPhase: null,
      },
      compilation: {
        status: "degraded",
        provider: "legacy-unocss",
        ownerPhase: 6,
      },
      snapshots: {
        status: "available",
        provider: "local-storage",
        ownerPhase: null,
      },
      thumbnails: {
        status: "unavailable",
        provider: null,
        ownerPhase: 9,
      },
      publish: {
        status: "available",
        provider: "guarded-sqlite",
        ownerPhase: null,
      },
      schedule: {
        status: "unavailable",
        provider: null,
        ownerPhase: 10,
      },
      export: {
        status: "degraded",
        provider: "local-export",
        ownerPhase: 9,
      },
    },
  },
  {
    runtime: "workerd",
    capabilities: {
      storage: {
        status: "available",
        provider: "d1",
        ownerPhase: null,
      },
      resources: {
        status: "available",
        provider: "r2-static-assets",
        ownerPhase: null,
      },
      compilation: {
        status: "degraded",
        provider: "legacy-unocss",
        ownerPhase: 6,
      },
      snapshots: {
        status: "available",
        provider: "platform-storage",
        ownerPhase: null,
      },
      thumbnails: {
        status: "unavailable",
        provider: null,
        ownerPhase: 9,
      },
      publish: {
        status: "available",
        provider: "guarded-d1",
        ownerPhase: null,
      },
      schedule: {
        status: "available",
        provider: "worker-cron",
        ownerPhase: null,
      },
      export: {
        status: "degraded",
        provider: "r2-export",
        ownerPhase: 9,
      },
    },
  },
] satisfies readonly RenderRuntimeCapabilityMatrix[];

type RunFoundationProbeOptions = Readonly<{
  runtimeTarget: RenderRuntimeTarget;
  observe?: (observation: RenderOperationObservation) => void;
}>;

/** Executes the exact portable fixture used by Node and workerd tests. */
export async function runFoundationProbe(
  options: RunFoundationProbeOptions,
): Promise<FoundationProbeResult> {
  const encoder = new TextEncoder();
  return observeRenderOperation({
    runtimeTarget: options.runtimeTarget,
    inputSizeBytes: encoder.encode(JSON.stringify(FOUNDATION_INPUT))
      .byteLength,
    fallbackErrorCode: "RENDER_STYLE_COMPILE_FAILED",
    observe: options.observe,
    operation: async () => {
      const input = FoundationProbeInputSchema.parse(FOUNDATION_INPUT);
      const normalizedInput = stableSerializeJson(input);
      const generator = await createGenerator(PORTABLE_UNO_CONFIG);
      const generated = await generator.generate(input.documentHtml);
      const css = generated.css.trim();
      const failures: RenderFailure[] = RENDER_ERROR_CODES.map((code) =>
        createRenderFailure(code),
      );

      return FoundationProbeResultSchema.parse({
        normalizedInput,
        inputHash: await hashCanonicalJson(input),
        documentHash: await hashCanonicalJson({
          contract: input.contract,
          html: input.documentHtml,
          locale: input.locale,
        }),
        stylesheetHash: await hashCanonicalJson({
          contract: input.contract,
          css,
        }),
        css,
        failures,
      });
    },
    outputSizeBytes: (result) => encoder.encode(result.css).byteLength,
  });
}

for (const matrix of FOUNDATION_CAPABILITY_MATRICES) {
  RenderRuntimeCapabilityMatrixSchema.parse(matrix);
}
