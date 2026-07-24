import { z } from "zod";
import {
  describeRuntimeCapability,
  summarizeRuntimeCapability,
  type RuntimeCapabilityRegistry,
} from "../capabilities/runtimeRegistry";
import { isServerToolName, type ServerToolName } from "./constants";

export const SearchCommandsInputSchema = z
  .object({
    query: z.string().trim().min(1).max(200),
    limit: z.int().min(1).max(20).default(8),
  })
  .strict();

export const DescribeCommandInputSchema = z
  .object({ command: z.string().min(1) })
  .strict();

export const ExecuteCommandInputSchema = z
  .object({
    command: z.string().min(1),
    input: z.unknown().default({}),
  })
  .strict();

const CommandSummarySchema = z
  .object({
    command: z.string().min(1),
    domain: z.string().min(1),
    description: z.string().min(1),
    scope: z.enum(["mcp:read", "mcp:write", "mcp:design", "mcp:publish"]),
    risk: z.enum(["read", "write", "destructive", "publish"]),
    confirmation: z.enum(["never", "conditional", "always"]),
    reversibility: z.enum(["exact", "compensating", "none"]),
  })
  .strict();

export type CommandSummary = z.infer<typeof CommandSummarySchema>;

function requireAllowedCommand(
  command: string,
  registry: RuntimeCapabilityRegistry,
): ServerToolName {
  if (!isServerToolName(command) || !registry.has(command)) {
    throw new Error(`Command is unavailable in this session: ${command}`);
  }
  return command;
}

function summarize(
  command: ServerToolName,
  registry: RuntimeCapabilityRegistry,
): CommandSummary {
  const source = registry.get(command);
  if (!source) {
    throw new Error(`Command is unavailable in this session: ${command}`);
  }
  return CommandSummarySchema.parse(
    summarizeRuntimeCapability(command, source),
  );
}

export function searchAllowedCommands(
  input: z.input<typeof SearchCommandsInputSchema>,
  registry: RuntimeCapabilityRegistry,
): CommandSummary[] {
  const parsed = SearchCommandsInputSchema.parse(input);
  const terms = parsed.query
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(Boolean);

  return [...registry.keys()]
    .filter((command) => {
      const source = registry.get(command);
      const searchable = [
        command.toLowerCase().replace(/^aria_/u, ""),
        source?.tool.description?.toLowerCase() ?? "",
      ].join(" ");
      return terms.every((term) => searchable.includes(term));
    })
    .slice(0, parsed.limit)
    .map((command) => summarize(command, registry));
}

export async function describeAllowedCommand(
  input: z.input<typeof DescribeCommandInputSchema>,
  registry: RuntimeCapabilityRegistry,
) {
  const parsed = DescribeCommandInputSchema.parse(input);
  const command = requireAllowedCommand(parsed.command, registry);
  const source = registry.get(command);
  if (!source) {
    throw new Error(`Command is unavailable in this session: ${command}`);
  }
  return describeRuntimeCapability(command, source);
}

export function parseExecuteCommand(
  input: z.input<typeof ExecuteCommandInputSchema>,
  registry: RuntimeCapabilityRegistry,
): { command: ServerToolName; input: unknown } {
  const parsed = ExecuteCommandInputSchema.parse(input);
  return {
    command: requireAllowedCommand(parsed.command, registry),
    input: parsed.input,
  };
}
