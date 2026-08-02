import { z } from "zod";

export const RENDER_ERROR_CODES = [
  "RENDER_INPUT_INVALID",
  "RENDER_DEPENDENCY_MISSING",
  "RENDER_DEPENDENCY_CYCLE",
  "RENDER_DATA_RESOLUTION_FAILED",
  "RENDER_RESOURCE_FAILED",
  "RENDER_STYLE_COMPILE_FAILED",
  "RENDER_ARTIFACT_MISSING",
  "RENDER_RUNTIME_UNAVAILABLE",
  "RENDER_REVISION_STALE",
] as const;

export const RenderErrorCodeSchema = z.enum(RENDER_ERROR_CODES);
export type RenderErrorCode = z.infer<typeof RenderErrorCodeSchema>;

const RenderFailureContextValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const RenderFailureContextSchema = z.record(
  z.string(),
  RenderFailureContextValueSchema,
);
export type RenderFailureContext = z.infer<
  typeof RenderFailureContextSchema
>;

export const RENDER_ERROR_MESSAGES = {
  RENDER_INPUT_INVALID: "The render input is invalid.",
  RENDER_DEPENDENCY_MISSING: "A required render dependency is missing.",
  RENDER_DEPENDENCY_CYCLE: "The render dependencies contain a cycle.",
  RENDER_DATA_RESOLUTION_FAILED: "Required render data could not be resolved.",
  RENDER_RESOURCE_FAILED: "A required render resource could not be loaded.",
  RENDER_STYLE_COMPILE_FAILED: "The render stylesheet could not be compiled.",
  RENDER_ARTIFACT_MISSING: "A required render artifact is unavailable.",
  RENDER_RUNTIME_UNAVAILABLE:
    "A required rendering capability is unavailable.",
  RENDER_REVISION_STALE: "The render result is stale.",
} satisfies Readonly<Record<RenderErrorCode, string>>;

export const RenderFailureSchema = z
  .object({
    code: RenderErrorCodeSchema,
    message: z.string().min(1),
    context: RenderFailureContextSchema.optional(),
  })
  .strict();
export type RenderFailure = z.infer<typeof RenderFailureSchema>;

/** Creates the runtime-neutral failure value returned across render boundaries. */
export function createRenderFailure(
  code: RenderErrorCode,
  context?: RenderFailureContext,
): RenderFailure {
  return RenderFailureSchema.parse({
    code,
    message: RENDER_ERROR_MESSAGES[code],
    ...(context === undefined ? {} : { context }),
  });
}

/** Portable error wrapper whose public shape never exposes a platform cause. */
export class RenderContractError extends Error {
  readonly failure: RenderFailure;

  constructor(failure: RenderFailure, options?: ErrorOptions) {
    super(failure.message, options);
    this.name = "RenderContractError";
    this.failure = RenderFailureSchema.parse(failure);
  }
}

/** Translates an unknown adapter exception into a stable rendering failure. */
export function translateRenderFailure(
  error: unknown,
  fallbackCode: RenderErrorCode,
  context?: RenderFailureContext,
): RenderContractError {
  if (error instanceof RenderContractError) {
    return error;
  }

  return new RenderContractError(createRenderFailure(fallbackCode, context), {
    cause: error,
  });
}
