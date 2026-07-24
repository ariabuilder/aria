import { workflows } from "../../../../../../actions/cms/workflows";
import type { AgentToolActionContext } from "../types";
import { invokeDefinedActionForTool } from "../invokeDefinedActionForTool";

export const ariaCompareEntryRevisions = (
  context: AgentToolActionContext,
  input: unknown,
) => invokeDefinedActionForTool(context, workflows.compareRevisions, input);

export const ariaGetEntryReview = (
  context: AgentToolActionContext,
  input: unknown,
) => invokeDefinedActionForTool(context, workflows.getReview, input);

export const ariaUpdateEntryReview = (
  context: AgentToolActionContext,
  input: unknown,
) => invokeDefinedActionForTool(context, workflows.updateReview, input);

export const ariaListReviewAnnotations = (
  context: AgentToolActionContext,
  input: unknown,
) => invokeDefinedActionForTool(context, workflows.listAnnotations, input);

export const ariaCreateReviewAnnotation = (
  context: AgentToolActionContext,
  input: unknown,
) => invokeDefinedActionForTool(context, workflows.createAnnotation, input);

export const ariaResolveReviewAnnotation = (
  context: AgentToolActionContext,
  input: unknown,
) => invokeDefinedActionForTool(context, workflows.resolveAnnotation, input);

export const ariaReopenReviewAnnotation = (
  context: AgentToolActionContext,
  input: unknown,
) => invokeDefinedActionForTool(context, workflows.reopenAnnotation, input);
