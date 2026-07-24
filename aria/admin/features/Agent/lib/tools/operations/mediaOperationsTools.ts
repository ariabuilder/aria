import { media } from "../../../../../../actions/media";
import type { AgentToolActionContext } from "../types";
import { invokeDefinedActionForTool } from "../invokeDefinedActionForTool";

const invoke = (
  context: AgentToolActionContext,
  action: unknown,
  input: unknown,
) => invokeDefinedActionForTool(context, action, input);

export const ariaGetMediaTransformState = (
  c: AgentToolActionContext,
  i: unknown,
) => invoke(c, media.getTransformState, i);
export const ariaSaveMediaProfile = (c: AgentToolActionContext, i: unknown) =>
  invoke(c, media.saveProfile, i);
export const ariaSaveMediaTransformVariant = (
  c: AgentToolActionContext,
  i: unknown,
) => invoke(c, media.saveTransformVariant, i);
export const ariaDeleteMediaTransformVariant = (
  c: AgentToolActionContext,
  i: unknown,
) => invoke(c, media.deleteTransformVariant, i);
export const ariaRebuildMediaUsageIndex = (
  c: AgentToolActionContext,
  i: unknown,
) => invoke(c, media.rebuildUsageIndex, i);
export const ariaListMediaSyncHistory = (
  c: AgentToolActionContext,
  i: unknown,
) => invoke(c, media.sync.history, i);
export const ariaPlanMediaSync = (c: AgentToolActionContext, i: unknown) =>
  invoke(c, media.sync.plan, i);
export const ariaApplyMediaSync = (c: AgentToolActionContext, i: unknown) =>
  invoke(c, media.sync.apply, i);
