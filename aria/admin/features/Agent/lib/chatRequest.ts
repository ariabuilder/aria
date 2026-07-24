import { z } from "zod";
import {
  AgentComposerModeSchema,
  AgentSessionModelOverrideSchema,
  AgentShellContextSchema,
  AgentSeoContextSchema,
  type AgentChatRequestExtras,
  type AgentComposerMode,
  type AgentSessionModelOverride,
  type AgentShellContext,
  type AgentSeoContext,
} from "./schemas";

export const AgentChatRequestExtrasSchema = z
  .object({
    composerMode: AgentComposerModeSchema.default("agent"),
    sessionModel: AgentSessionModelOverrideSchema.optional(),
    shellContext: AgentShellContextSchema.optional(),
    seoContext: AgentSeoContextSchema.optional(),
  })
  .strict();

export type ParsedAgentChatRequestExtras = z.infer<
  typeof AgentChatRequestExtrasSchema
>;

const DEFAULT_EXTRAS: ParsedAgentChatRequestExtras = {
  composerMode: "agent",
};

function resolveChatRequestExtrasRecord(
  body: string | Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  if (body == null) {
    return null;
  }

  if (typeof body === "string") {
    if (!body.trim()) {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(body);
      if (typeof parsed === "object" && parsed !== null) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }

    return null;
  }

  if (typeof body === "object") {
    return body;
  }

  return null;
}

export function parseAgentChatRequestExtras(
  body: string | Record<string, unknown> | undefined,
): ParsedAgentChatRequestExtras {
  const record = resolveChatRequestExtrasRecord(body);
  if (!record) {
    return DEFAULT_EXTRAS;
  }

  const result = AgentChatRequestExtrasSchema.safeParse({
    composerMode: record.composerMode,
    sessionModel: record.sessionModel,
    shellContext: record.shellContext,
    seoContext: record.seoContext,
  });

  if (result.success) {
    return result.data;
  }

  return DEFAULT_EXTRAS;
}

export function toChatRequestExtras(input: {
  composerMode: AgentComposerMode;
  sessionModel?: AgentSessionModelOverride;
  shellContext?: AgentShellContext;
  seoContext?: AgentSeoContext;
}): AgentChatRequestExtras {
  return AgentChatRequestExtrasSchema.parse(input);
}
