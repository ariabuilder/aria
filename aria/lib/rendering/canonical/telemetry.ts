import { z } from "zod";

import { RenderRuntimeTargetSchema } from "./capabilities";
import {
  RENDER_ERROR_CODES,
  translateRenderFailure,
  type RenderErrorCode,
} from "./errors";

export const RenderOperationObservationSchema = z
  .object({
    runtimeTarget: RenderRuntimeTargetSchema,
    durationMs: z.number().nonnegative(),
    inputSizeBytes: z.int().nonnegative(),
    outputSizeBytes: z.int().nonnegative(),
    errorCode: z.enum(RENDER_ERROR_CODES).nullable(),
  })
  .strict();
export type RenderOperationObservation = z.infer<
  typeof RenderOperationObservationSchema
>;

type ObserveRenderOperationOptions<Result> = Readonly<{
  runtimeTarget: z.infer<typeof RenderRuntimeTargetSchema>;
  inputSizeBytes: number;
  fallbackErrorCode: RenderErrorCode;
  operation: () => Promise<Result>;
  outputSizeBytes: (result: Result) => number;
  observe?: (observation: RenderOperationObservation) => void;
}>;

/** Measures a portable operation without retaining or emitting render content. */
export async function observeRenderOperation<Result>(
  options: ObserveRenderOperationOptions<Result>,
): Promise<Result> {
  const startedAt = performance.now();
  const inputSizeBytes = z.int().nonnegative().parse(options.inputSizeBytes);

  try {
    const result = await options.operation();
    options.observe?.(
      RenderOperationObservationSchema.parse({
        runtimeTarget: options.runtimeTarget,
        durationMs: Math.max(0, performance.now() - startedAt),
        inputSizeBytes,
        outputSizeBytes: options.outputSizeBytes(result),
        errorCode: null,
      }),
    );
    return result;
  } catch (error) {
    const translated = translateRenderFailure(
      error,
      options.fallbackErrorCode,
    );
    options.observe?.(
      RenderOperationObservationSchema.parse({
        runtimeTarget: options.runtimeTarget,
        durationMs: Math.max(0, performance.now() - startedAt),
        inputSizeBytes,
        outputSizeBytes: 0,
        errorCode: translated.failure.code,
      }),
    );
    throw translated;
  }
}
