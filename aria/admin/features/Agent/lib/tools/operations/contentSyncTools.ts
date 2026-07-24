import { contentSync } from "../../../../../../actions/content-sync";
import type { AgentToolActionContext } from "../types";
import { invokeDefinedActionForTool } from "../invokeDefinedActionForTool";

export const ariaPlanContentSync = (
  context: AgentToolActionContext,
  input: unknown,
) => invokeDefinedActionForTool(context, contentSync.plan, input);
export const ariaApplyContentSync = (
  context: AgentToolActionContext,
  input: unknown,
) => invokeDefinedActionForTool(context, contentSync.apply, input);
export const ariaGetContentSyncStatus = (
  context: AgentToolActionContext,
  input: unknown,
) => invokeDefinedActionForTool(context, contentSync.status, input);
export const ariaListContentSyncHistory = (
  context: AgentToolActionContext,
  input: unknown,
) => invokeDefinedActionForTool(context, contentSync.history, input);
