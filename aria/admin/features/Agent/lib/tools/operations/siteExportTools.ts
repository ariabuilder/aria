import { siteExport } from "../../../../../../actions/site-export";
import type { AgentToolActionContext } from "../types";
import { invokeDefinedActionForTool } from "../invokeDefinedActionForTool";

export const ariaListSiteExports = (
  context: AgentToolActionContext,
  input: unknown,
) => invokeDefinedActionForTool(context, siteExport.list, input);
export const ariaGetLatestSiteExport = (
  context: AgentToolActionContext,
  input: unknown,
) => invokeDefinedActionForTool(context, siteExport.getLatest, input);
export const ariaCreateSiteExport = (
  context: AgentToolActionContext,
  input: unknown,
) => invokeDefinedActionForTool(context, siteExport.create, input);
export const ariaDeleteSiteExport = (
  context: AgentToolActionContext,
  input: unknown,
) => invokeDefinedActionForTool(context, siteExport.delete, input);
