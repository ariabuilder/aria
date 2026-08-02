import { describe, expect, it } from "vitest";

import {
  RENDER_ERROR_CODES,
  RENDER_ERROR_MESSAGES,
  RenderContractError,
  RenderRuntimeCapabilityMatrixSchema,
  RendererBaseStyleFragmentSchema,
  assembleRendererBaseCss,
  buildRendererBaseStyleFragment,
  createRenderFailure,
  observeRenderOperation,
  requireRenderCapability,
  stableSerializeJson,
  translateRenderFailure,
  type RenderRuntimeTarget,
  type RenderOperationObservation,
} from "../../lib/rendering/canonical";
import {
  FOUNDATION_CAPABILITY_MATRICES,
  runFoundationProbe,
} from "./foundationProbe";

declare const __ARIA_FOUNDATION_RUNTIME__: RenderRuntimeTarget;

const EXPECTED_NORMALIZED_INPUT =
  '{"contract":"aria-render-foundation@1","documentHtml":"<main id=\\"content\\" aria-label=\\"Foundation fixture\\" class=\\"grid gap-4 md:grid-cols-2\\"><h1 class=\\"text-3xl font-bold\\">Rendering v2</h1><p class=\\"prose text-slate-700\\">Portable by construction.</p><a href=\\"/docs\\" class=\\"btn-foundation\\">Read the plan</a></main>","locale":"en-CA","nodes":[{"attributes":{"aria-label":"Foundation fixture","id":"content"},"children":["heading","copy","link"],"classes":["grid","gap-4","md:grid-cols-2"],"id":"root","tag":"main"},{"attributes":{},"children":["Rendering v2"],"classes":["text-3xl","font-bold"],"id":"heading","tag":"h1"},{"attributes":{},"children":["Portable by construction."],"classes":["prose","text-slate-700"],"id":"copy","tag":"p"},{"attributes":{"href":"/docs"},"children":["Read the plan"],"classes":["btn-foundation"],"id":"link","tag":"a"}],"surfaceId":"page:home@7"}';

describe("Rendering v2 portable foundation", () => {
  it("produces identical renderer-base CSS and hashes in Node and workerd", async () => {
    const css = assembleRendererBaseCss(["managed-image-intrinsic-ratio"]);
    const fragment = await buildRendererBaseStyleFragment([
      "managed-image-intrinsic-ratio",
    ]);

    expect(css).toBe(
      ":where(img.aria-managed-image) {\n  width: auto;\n  height: auto;\n}",
    );
    expect(fragment).toMatchObject({
      kind: "renderer-base",
      contractVersion: "rendering-v2.renderer-base.v1",
      provenance: "aria-renderer",
      requirements: ["managed-image-intrinsic-ratio"],
    });
    expect(fragment?.hash).toBe(
      "441da83d1d76311f1bbf5fbe4c9709865028028d950231f706a0ca2e0cb6e8dc",
    );
    expect(() =>
      RendererBaseStyleFragmentSchema.parse({
        ...fragment,
        runtime: __ARIA_FOUNDATION_RUNTIME__,
      }),
    ).toThrow();
  });

  it("produces the canonical golden fixture", async () => {
    const observations: RenderOperationObservation[] = [];
    const result = await runFoundationProbe({
      runtimeTarget: __ARIA_FOUNDATION_RUNTIME__,
      observe: (observation) => observations.push(observation),
    });

    expect(result.normalizedInput).toBe(EXPECTED_NORMALIZED_INPUT);
    expect(result.inputHash).toBe(
      "a4dc6bb1633ca4c72813805aa9b57c6db747a1de41720d15881cd263d31f9c6d",
    );
    expect(result.documentHash).toBe(
      "f010544bdc0486a8ffaadadcee10206054132816eb0ba59877088e488c052f41",
    );
    expect(result.stylesheetHash).toBe(
      "45032871d444b17d692472e5fe1df0d9a1ee7a984f51d1a1af0471101e04bb34",
    );
    expect(result.css).toContain(".grid{display:grid;}");
    expect(result.css).toContain(".md\\:grid-cols-2");
    expect(result.css).toContain(".btn-foundation");
    expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({
      runtimeTarget: __ARIA_FOUNDATION_RUNTIME__,
      errorCode: null,
    });
    expect(observations[0]?.durationMs).toBeGreaterThanOrEqual(0);
    expect(observations[0]?.inputSizeBytes).toBeGreaterThan(0);
    expect(observations[0]?.outputSizeBytes).toBeGreaterThan(0);
    expect(Object.keys(observations[0] ?? {})).toEqual([
      "runtimeTarget",
      "durationMs",
      "inputSizeBytes",
      "outputSizeBytes",
      "errorCode",
    ]);
  });

  it("keeps every error code and public message stable", () => {
    const failures = RENDER_ERROR_CODES.map((code) =>
      createRenderFailure(code),
    );

    expect(failures).toEqual(
      RENDER_ERROR_CODES.map((code) => ({
        code,
        message: RENDER_ERROR_MESSAGES[code],
      })),
    );
  });

  it("translates unknown runtime errors without leaking their message", () => {
    const translated = translateRenderFailure(
      new Error("platform-specific secret"),
      "RENDER_RUNTIME_UNAVAILABLE",
      { capability: "foundation-probe" },
    );

    expect(translated).toBeInstanceOf(RenderContractError);
    expect(translated.failure).toEqual({
      code: "RENDER_RUNTIME_UNAVAILABLE",
      message: RENDER_ERROR_MESSAGES.RENDER_RUNTIME_UNAVAILABLE,
      context: { capability: "foundation-probe" },
    });
    expect(translated.message).not.toContain("platform-specific secret");
  });

  it("rejects unsupported values and normalizes negative zero", () => {
    expect(stableSerializeJson({ value: -0 })).toBe('{"value":0}');
    expect(() => stableSerializeJson({ value: Number.NaN })).toThrow(
      RenderContractError,
    );
    expect(() => stableSerializeJson({ value: undefined })).toThrow(
      RenderContractError,
    );
  });

  it("keeps the capability ledger exhaustive and typed", () => {
    expect(
      FOUNDATION_CAPABILITY_MATRICES.map((matrix) =>
        RenderRuntimeCapabilityMatrixSchema.parse(matrix),
      ),
    ).toHaveLength(2);
    expect(
      requireRenderCapability(FOUNDATION_CAPABILITY_MATRICES[0], "storage"),
    ).toMatchObject({
      status: "available",
      provider: "sqlite",
    });
    expect(() =>
      requireRenderCapability(FOUNDATION_CAPABILITY_MATRICES[1], "thumbnails"),
    ).toThrow(RenderContractError);
  });

  it("observes typed failures without emitting operation content", async () => {
    const observations: RenderOperationObservation[] = [];

    await expect(
      observeRenderOperation({
        runtimeTarget: __ARIA_FOUNDATION_RUNTIME__,
        inputSizeBytes: 17,
        fallbackErrorCode: "RENDER_RESOURCE_FAILED",
        operation: async () => {
          throw new Error("platform-only failure content");
        },
        outputSizeBytes: () => 0,
        observe: (observation) => observations.push(observation),
      }),
    ).rejects.toMatchObject({
      failure: {
        code: "RENDER_RESOURCE_FAILED",
        message: RENDER_ERROR_MESSAGES.RENDER_RESOURCE_FAILED,
      },
    });
    expect(observations).toEqual([
      {
        runtimeTarget: __ARIA_FOUNDATION_RUNTIME__,
        durationMs: expect.any(Number),
        inputSizeBytes: 17,
        outputSizeBytes: 0,
        errorCode: "RENDER_RESOURCE_FAILED",
      },
    ]);
    expect(JSON.stringify(observations)).not.toContain(
      "platform-only failure content",
    );
  });
});
