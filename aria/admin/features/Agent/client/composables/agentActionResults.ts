import { z } from "zod";
import {
  AgentAvailabilitySchema,
  AgentChatHistoryResponseSchema,
  AgentClearChatResponseSchema,
  AgentToolCallSchema,
  AgentToolStepSchema,
  CatalogModelsResponseSchema,
  AgentSettingsSchema,
} from "../../lib/schemas";

export const AgentActionSuccessSchema = z
  .looseObject({
    success: z.literal(true),
  });

export function unwrapAgentAvailabilityPayload(input: unknown) {
  const envelope = z
    .object({
      success: z.literal(true),
      data: AgentAvailabilitySchema,
    })
    .parse(input);
  return envelope.data;
}

export function unwrapCatalogModelsPayload(input: unknown) {
  const envelope = z
    .object({
      success: z.literal(true),
      data: CatalogModelsResponseSchema,
    })
    .parse(input);
  return envelope.data;
}

/** @deprecated Use unwrapCatalogModelsPayload */
export function unwrapWorkersAiModelsPayload(input: unknown) {
  return unwrapCatalogModelsPayload(input);
}

/** @deprecated Use unwrapCatalogModelsPayload */
export function unwrapOpencodeModelsPayload(input: unknown) {
  return unwrapCatalogModelsPayload(input);
}

export function unwrapAgentChatPayload(input: unknown) {
  return z
    .object({
      success: z.literal(true),
      data: z.object({
        message: z.object({
          id: z.string(),
          role: z.enum(["assistant"]),
          content: z.string(),
          createdAt: z.string(),
          toolSteps: z.array(AgentToolStepSchema).optional(),
          stopped: z.boolean().optional(),
          reasoning: z.string().optional(),
        }),
        pendingClientTools: z.array(AgentToolCallSchema).optional(),
      }),
    })
    .parse(input).data;
}

export function unwrapAgentChatHistoryPayload(input: unknown) {
  const envelope = z
    .object({
      success: z.literal(true),
      data: AgentChatHistoryResponseSchema,
    })
    .parse(input);
  return envelope.data;
}

export function unwrapAgentClearChatPayload(input: unknown) {
  const envelope = z
    .object({
      success: z.literal(true),
      data: AgentClearChatResponseSchema,
    })
    .parse(input);
  return envelope.data;
}

export function unwrapAgentSettingsPayload(input: unknown) {
  return z
    .object({
      success: z.literal(true),
      data: z.object({
        agent: AgentSettingsSchema.optional(),
      }),
    })
    .parse(input).data;
}
