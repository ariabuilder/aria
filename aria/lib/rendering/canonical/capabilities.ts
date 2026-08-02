import { z } from "zod";

import {
  RenderContractError,
  createRenderFailure,
} from "./errors";

export const RenderRuntimeTargetSchema = z.enum([
  "node",
  "workerd",
  "browser-worker",
]);
export type RenderRuntimeTarget = z.infer<typeof RenderRuntimeTargetSchema>;

export const RenderCapabilityNameSchema = z.enum([
  "storage",
  "resources",
  "compilation",
  "snapshots",
  "thumbnails",
  "publish",
  "schedule",
  "export",
]);
export type RenderCapabilityName = z.infer<
  typeof RenderCapabilityNameSchema
>;

export const RenderCapabilityStatusSchema = z.enum([
  "available",
  "degraded",
  "unavailable",
]);
export type RenderCapabilityStatus = z.infer<
  typeof RenderCapabilityStatusSchema
>;

export const RenderCapabilitySchema = z
  .object({
    status: RenderCapabilityStatusSchema,
    provider: z.string().min(1).nullable(),
    ownerPhase: z.int().min(1).max(11).nullable(),
  })
  .strict()
  .superRefine((capability, context) => {
    if (capability.status === "available" && capability.ownerPhase !== null) {
      context.addIssue({
        code: "custom",
        message: "Available capabilities cannot retain an owner phase.",
        path: ["ownerPhase"],
      });
    }
    if (capability.status !== "available" && capability.ownerPhase === null) {
      context.addIssue({
        code: "custom",
        message: "Incomplete capabilities require an owner phase.",
        path: ["ownerPhase"],
      });
    }
  });
export type RenderCapability = z.infer<typeof RenderCapabilitySchema>;

export const RenderRuntimeCapabilityMatrixSchema = z
  .object({
    runtime: RenderRuntimeTargetSchema,
    capabilities: z.record(
      RenderCapabilityNameSchema,
      RenderCapabilitySchema,
    ),
  })
  .strict();
export type RenderRuntimeCapabilityMatrix = z.infer<
  typeof RenderRuntimeCapabilityMatrixSchema
>;

/** Fails with the shared error contract when a runtime capability is incomplete. */
export function requireRenderCapability(
  input: unknown,
  capabilityName: RenderCapabilityName,
): RenderCapability {
  const matrix = RenderRuntimeCapabilityMatrixSchema.parse(input);
  const capability = matrix.capabilities[capabilityName];
  if (capability.status !== "available") {
    throw new RenderContractError(
      createRenderFailure("RENDER_RUNTIME_UNAVAILABLE", {
        runtime: matrix.runtime,
        capability: capabilityName,
        status: capability.status,
      }),
    );
  }
  return capability;
}
