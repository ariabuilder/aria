import { EN_AGENT_MESSAGES, FR_AGENT_MESSAGES } from "./index";

export const EN_AGENT_MESSAGE_MODULES = {
  agent: EN_AGENT_MESSAGES,
} as const;

export const FR_AGENT_MESSAGE_MODULES = {
  agent: FR_AGENT_MESSAGES,
} as const;

export const EN_AGENT_ALL_MESSAGES = {
  ...EN_AGENT_MESSAGES,
} as const;

export const FR_AGENT_ALL_MESSAGES = {
  ...FR_AGENT_MESSAGES,
} as const;
