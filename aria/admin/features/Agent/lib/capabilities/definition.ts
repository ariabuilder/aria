import type { JSONSchema7, Tool } from "ai";
import { z } from "zod";
import type { ServerToolName } from "../tools/constants";
import type { ToolPolicy } from "../policy/toolPolicy";

export const AgentCapabilityDomainSchema = z.enum([
  "system",
  "content",
  "cms",
  "design",
  "settings",
  "media",
  "localization",
  "redirects",
  "publishing",
  "analytics",
  "discovery",
  "workflow",
  "library",
  "export",
  "synchronization",
  "operations",
  "administration",
]);

export type AgentCapabilityDomain = z.infer<typeof AgentCapabilityDomainSchema>;

export interface RuntimeCapabilitySource {
  tool: Tool;
}

export interface AgentCapabilitySummary {
  command: ServerToolName;
  domain: AgentCapabilityDomain;
  description: string;
  scope: ToolPolicy["scope"];
  risk: ToolPolicy["risk"];
  confirmation: ToolPolicy["confirmation"];
  reversibility: ToolPolicy["reversibility"];
}

export interface AgentCapabilityDescription extends AgentCapabilitySummary {
  inputSchema: JSONSchema7;
  inputExamples: unknown[];
  externalSideEffect: boolean;
}
