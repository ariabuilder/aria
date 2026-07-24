import { library } from "../../../../../../actions/library";
import type { AgentToolActionContext } from "../types";
import { invokeDefinedActionForTool } from "../invokeDefinedActionForTool";

export const ariaSearchLibrary = (
  context: AgentToolActionContext,
  input: unknown,
) => invokeDefinedActionForTool(context, library.catalog, input);
export const ariaListInstalledLibraryPacks = (
  context: AgentToolActionContext,
  input: unknown,
) => invokeDefinedActionForTool(context, library.listInstalled, input);
export const ariaCheckLibraryUpdates = (
  context: AgentToolActionContext,
  input: unknown,
) => invokeDefinedActionForTool(context, library.checkUpdates, input);
export const ariaInstallLibraryPack = (
  context: AgentToolActionContext,
  input: unknown,
) => invokeDefinedActionForTool(context, library.installPack, input);
export const ariaInstallLibraryComponent = (
  context: AgentToolActionContext,
  input: unknown,
) => invokeDefinedActionForTool(context, library.installComponent, input);
export const ariaUninstallLibraryPack = (
  context: AgentToolActionContext,
  input: unknown,
) => invokeDefinedActionForTool(context, library.uninstallPack, input);
