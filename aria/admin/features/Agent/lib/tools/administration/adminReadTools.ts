import { settings } from "../../../../../../actions/settings";
import { cache } from "../../../../../../actions/cache";
import { listUsers } from "../../../../../../actions/auth/users";
import { email } from "../../../../../../actions/email";
import { getAuthMethodsConfigAction } from "../../../../../../actions/auth/configuration";
import { getTwoFactorPolicy } from "../../../../../../actions/auth/policy";
import { platform } from "../../../../../../actions/platform";
import type { AgentToolActionContext } from "../types";
import { invokeDefinedActionForTool } from "../invokeDefinedActionForTool";

export const ariaGetSystemStatus = (c: AgentToolActionContext, i: unknown) =>
  invokeDefinedActionForTool(c, settings.system, i);
export const ariaGetCacheStats = (c: AgentToolActionContext, i: unknown) =>
  invokeDefinedActionForTool(c, cache.getStats, i);
export const ariaGetCacheObservability = (
  c: AgentToolActionContext,
  i: unknown,
) => invokeDefinedActionForTool(c, cache.getObservability, i);
export const ariaListUsers = (c: AgentToolActionContext, i: unknown) =>
  invokeDefinedActionForTool(c, listUsers, i);
export const ariaListEmailConnections = (
  c: AgentToolActionContext,
  i: unknown,
) => invokeDefinedActionForTool(c, email.connections.list, i);
export const ariaListEmailRoutes = (c: AgentToolActionContext, i: unknown) =>
  invokeDefinedActionForTool(c, email.routes.list, i);
export const ariaGetEmailOutboxOverview = (
  c: AgentToolActionContext,
  i: unknown,
) => invokeDefinedActionForTool(c, email.outbox.overview, i);
export const ariaListEmailDeliveries = (
  c: AgentToolActionContext,
  i: unknown,
) => invokeDefinedActionForTool(c, email.outbox.list, i);
export const ariaGetAuthMethodsConfig = (
  c: AgentToolActionContext,
  i: unknown,
) => invokeDefinedActionForTool(c, getAuthMethodsConfigAction, i);
export const ariaGetTwoFactorPolicy = (c: AgentToolActionContext, i: unknown) =>
  invokeDefinedActionForTool(c, getTwoFactorPolicy, i);
export const ariaGetPlatformInfo = (c: AgentToolActionContext, i: unknown) =>
  invokeDefinedActionForTool(c, platform.info, i);
export const ariaGetPlatformMetrics = (c: AgentToolActionContext, i: unknown) =>
  invokeDefinedActionForTool(c, platform.metrics, i);
