import type { $ZodIssue } from "zod/v4/core";
import type { AgentToolError, AgentToolErrorCode } from "../schemas";
import { decodeRenderActionErrorMessage } from "../../../../../lib/rendering/actionErrorMessage";

function isActionError(
  error: unknown,
): error is { code: string; message: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    typeof (error as { code: unknown }).code === "string" &&
    typeof (error as { message: unknown }).message === "string"
  );
}

export function createToolError(input: AgentToolError): AgentToolError {
  return input;
}

export function toolErrorFromZod(
  message: string,
  issues: $ZodIssue[],
): AgentToolError {
  return {
    code: "INVALID_INPUT",
    message,
    zodIssues: issues,
    suggestedFix: "Fix the input fields and retry.",
  };
}

export function toolErrorResult<_T>(error: AgentToolError): {
  ok: false;
  error: AgentToolError;
} {
  return { ok: false, error };
}

export function toolSuccessResult<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

function inferSuggestedFix(message: string): string | undefined {
  if (message.includes("editPages")) {
    return "Ask an administrator with page edit access to grant you the 'Edit pages' capability.";
  }
  if (message.includes("editSiteSettings")) {
    return "Ask an administrator with site settings access to grant you the 'Edit site settings' capability.";
  }
  if (message.includes("editAgentSettings")) {
    return "Ask an administrator to grant you the 'Edit agent settings' capability.";
  }
  if (message.includes("useStudioAgent")) {
    return "Ask an administrator to grant you access to the Aria Engineer.";
  }
  if (
    message.includes("mcp:read") ||
    message.includes("mcp:write") ||
    message.includes("mcp:design") ||
    message.includes("mcp:publish")
  ) {
    return "Your MCP token does not grant the required scope for this action. Create a new token with the appropriate scopes.";
  }
  return undefined;
}

export function mapActionErrorToToolError(error: unknown): AgentToolError {
  if (
    error &&
    typeof error === "object" &&
    "toolError" in error &&
    (error as { toolError?: unknown }).toolError &&
    typeof (error as { toolError: unknown }).toolError === "object"
  ) {
    return (error as { toolError: AgentToolError }).toolError;
  }

  if (isActionError(error)) {
    const renderError = decodeRenderActionErrorMessage(error.message);
    if (renderError) {
      return {
        code: renderError.code,
        message: renderError.message,
      };
    }
    const code = mapActionCode(error.code);
    return {
      code,
      message: error.message,
      suggestedFix:
        code === "FORBIDDEN" ? inferSuggestedFix(error.message) : undefined,
    };
  }

  if (error instanceof Error) {
    const message = error.message;
    if (message.includes("not found") || message.includes("NOT_FOUND")) {
      return { code: "NOT_FOUND", message };
    }
    const code =
      "code" in error && typeof (error as { code: unknown }).code === "string"
        ? mapActionCode((error as { code: string }).code)
        : "INTERNAL";
    return { code, message };
  }

  return { code: "INTERNAL", message: "An unexpected error occurred." };
}

function mapActionCode(code: string): AgentToolErrorCode {
  switch (code) {
    case "UNAUTHORIZED":
    case "FORBIDDEN":
      return "FORBIDDEN";
    case "NOT_FOUND":
    case "TEMPLATE_NOT_FOUND":
      return "NOT_FOUND";
    case "CONFLICT":
      return "CONFLICT";
    case "BAD_REQUEST":
    case "INVALID_INPUT":
      return "INVALID_INPUT";
    case "RENDER_INPUT_INVALID":
      return "RENDER_INPUT_INVALID";
    case "TOO_MANY_REQUESTS":
      return "RATE_LIMITED";
    default:
      return "INTERNAL";
  }
}

export function formatToolErrorForModel(error: AgentToolError): string {
  const parts = [`[${error.code}] ${error.message}`];
  if (error.suggestedFix) {
    parts.push(`Suggested fix: ${error.suggestedFix}`);
  }
  return parts.join(" ");
}

/**
 * Role-aware denial message for the model. Returns a human-readable explanation of why
 * an action was denied and what to do about it, tailored.
 */
export function formatDenialForModel(
  error: AgentToolError,
  toolName?: string,
): string {
  if (error.code !== "FORBIDDEN") {
    return formatToolErrorForModel(error);
  }

  const toolHint = toolName ? ` for \`${toolName}\`` : "";

  const templates: Record<string, string> = {
    editPages: `You do not have permission to edit pages${toolHint}. Ask an administrator with "Edit pages" capability.`,
    editSiteSettings: `You do not have permission to modify site settings${toolHint}. Ask an administrator with "Edit site settings" capability.`,
    editAgentSettings: `You do not have permission to manage agent settings${toolHint}. Ask an administrator.`,
    useStudioAgent: `You do not have permission to use the Aria Engineer${toolHint}. Ask an administrator to grant access.`,
  };

  for (const [capability, template] of Object.entries(templates)) {
    if (error.message.toLowerCase().includes(capability.toLowerCase())) {
      return template;
    }
  }

  return `You do not have permission to perform this action${toolHint}. Contact your site administrator.`;
}
