import type { AgentComposerMode } from "./schemas";

export const AGENT_COMPOSER_MODES = ["agent", "ask"] as const satisfies readonly AgentComposerMode[];

export interface AgentComposerModeDefinition {
  id: AgentComposerMode;
  label: string;
  description: string;
  placeholder: string;
}

export const AGENT_COMPOSER_MODE_DEFINITIONS: readonly AgentComposerModeDefinition[] = [
  {
    id: "agent",
    label: "Agent",
    description: "Goal-oriented guidance and intended actions",
    placeholder: "Tell Aria what to do…",
  },
  {
    id: "ask",
    label: "Ask",
    description: "Q&A and explanations without unsolicited plans",
    placeholder: "Ask a question about your site…",
  },
] as const;

export function getComposerModeDefinition(
  mode: AgentComposerMode,
): AgentComposerModeDefinition {
  const match = AGENT_COMPOSER_MODE_DEFINITIONS.find((entry) => entry.id === mode);
  if (!match) {
    return AGENT_COMPOSER_MODE_DEFINITIONS[0];
  }
  return match;
}

export function cycleComposerMode(current: AgentComposerMode): AgentComposerMode {
  const index = AGENT_COMPOSER_MODES.indexOf(current);
  const nextIndex = index === -1 ? 0 : (index + 1) % AGENT_COMPOSER_MODES.length;
  return AGENT_COMPOSER_MODES[nextIndex];
}
