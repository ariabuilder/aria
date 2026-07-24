import { asSchema, type JSONSchema7, type Tool } from "ai";
import type {
  AgentCapabilityDescription,
  AgentCapabilityDomain,
  AgentCapabilitySummary,
  RuntimeCapabilitySource,
} from "./definition";
import {
  isCmsReadToolName,
  isAdminToolName,
  isCmsWriteToolName,
  isDesignExtendedToolName,
  isPublishToolName,
  isServerToolName,
  type ServerToolName,
} from "../tools/constants";
import { getServerToolPolicy } from "../policy/toolPolicy";

export type RuntimeCapabilityRegistry = ReadonlyMap<
  ServerToolName,
  RuntimeCapabilitySource
>;

function domainForTool(toolName: ServerToolName): AgentCapabilityDomain {
  if (isAdminToolName(toolName)) return "administration";
  if (toolName.includes("traffic") || toolName.includes("analytics")) {
    return "analytics";
  }
  if (toolName.includes("discovery")) return "discovery";
  if (toolName.includes("review") || toolName.includes("revision")) {
    return "workflow";
  }
  if (toolName.includes("library")) return "library";
  if (toolName.includes("site_export")) return "export";
  if (toolName.includes("sync")) return "synchronization";
  if (isCmsReadToolName(toolName) || isCmsWriteToolName(toolName)) return "cms";
  if (isPublishToolName(toolName)) return "publishing";
  if (toolName.includes("localization") || toolName.includes("translation")) {
    return "localization";
  }
  if (toolName.includes("media") || toolName.includes("page_cover")) {
    return "media";
  }
  if (toolName.includes("redirect")) return "redirects";
  if (toolName.includes("site_settings") || toolName.includes("appearance")) {
    return "settings";
  }
  if (isDesignExtendedToolName(toolName)) return "design";
  if (toolName.includes("site_context")) return "system";
  return "content";
}

function descriptionForTool(toolName: ServerToolName, tool: Tool): string {
  return tool.description?.trim() || toolName.replace(/^aria_/u, "");
}

export function createRuntimeCapabilityRegistry(
  tools: Readonly<Record<string, Tool>>,
): RuntimeCapabilityRegistry {
  const entries: Array<[ServerToolName, RuntimeCapabilitySource]> = [];
  for (const [toolName, tool] of Object.entries(tools)) {
    if (isServerToolName(toolName)) {
      entries.push([toolName, { tool }]);
    }
  }
  return new Map(entries);
}

export function summarizeRuntimeCapability(
  toolName: ServerToolName,
  source: RuntimeCapabilitySource,
): AgentCapabilitySummary {
  const policy = getServerToolPolicy(toolName);
  return {
    command: toolName,
    domain: domainForTool(toolName),
    description: descriptionForTool(toolName, source.tool),
    scope: policy.scope,
    risk: policy.risk,
    confirmation: policy.confirmation,
    reversibility: policy.reversibility,
  };
}

export async function describeRuntimeCapability(
  toolName: ServerToolName,
  source: RuntimeCapabilitySource,
): Promise<AgentCapabilityDescription> {
  const policy = getServerToolPolicy(toolName);
  const schema = asSchema(source.tool.inputSchema);
  const inputSchema = (await schema.jsonSchema) as JSONSchema7;
  return {
    ...summarizeRuntimeCapability(toolName, source),
    inputSchema,
    inputExamples: (source.tool.inputExamples ?? []).map(
      (example) => example.input,
    ),
    externalSideEffect: policy.externalSideEffect,
  };
}
