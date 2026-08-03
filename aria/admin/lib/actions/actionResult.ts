import { z } from "zod";

import { log } from "@/lib/utils/logger";
import { decodeRenderActionErrorMessage } from "../../../lib/rendering/actionErrorMessage";

export type ActionTransportErrorLike = {
  message?: string;
  code?: string;
};

export type ActionTransportResult =
  | {
      data?: unknown;
      error?: ActionTransportErrorLike | null;
    }
  | null
  | undefined;

export type ActionResultFailure = {
  success: false;
  error: string;
};

export type ActionPayloadResult<TData> =
  | {
      success: true;
      data: TData;
    }
  | ActionResultFailure;

export interface ParseActionPayloadOptions {
  invalidLogMessage?: string;
  context?: Record<string, unknown>;
}

export interface UnwrapActionPayloadOptions extends ParseActionPayloadOptions {
  fallbackMessage: string;
  requireData?: boolean;
}

export function getTransportErrorMessage(
  result: ActionTransportResult,
  fallbackMessage: string,
): string | null {
  if (!result?.error) {
    return null;
  }

  const decodedMessage = decodeRenderActionErrorMessage(
    result.error.message,
  )?.message;
  if (decodedMessage && decodedMessage.trim().length > 0) {
    return decodedMessage;
  }

  const transportMessage = result.error.message;
  return typeof transportMessage === "string" &&
    transportMessage.trim().length > 0
    ? transportMessage
    : fallbackMessage;
}

export function getTransportErrorCode(
  result: ActionTransportResult,
): string | undefined {
  const renderError = decodeRenderActionErrorMessage(result?.error?.message);
  if (renderError) return renderError.code;
  const code = result?.error?.code;
  return typeof code === "string" && code.trim().length > 0 ? code : undefined;
}

export function parseActionPayload<TSchema extends z.ZodTypeAny>(
  data: unknown,
  schema: TSchema,
  options: ParseActionPayloadOptions = {},
): z.infer<TSchema> | null {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    if (options.invalidLogMessage) {
      log("warn", options.invalidLogMessage, {
        issues: parsed.error.issues,
        ...options.context,
      });
    }
    return null;
  }

  return parsed.data;
}

export function unwrapActionPayload<TSchema extends z.ZodTypeAny>(
  result: ActionTransportResult,
  schema: TSchema,
  options: UnwrapActionPayloadOptions,
): ActionPayloadResult<z.infer<TSchema>> {
  const transportError = getTransportErrorMessage(
    result,
    options.fallbackMessage,
  );
  if (transportError) {
    return {
      success: false,
      error: transportError,
    };
  }

  if (options.requireData && result?.data == null) {
    return {
      success: false,
      error: options.fallbackMessage,
    };
  }

  const data = parseActionPayload(result?.data, schema, options);
  if (!data) {
    return {
      success: false,
      error: options.fallbackMessage,
    };
  }

  return {
    success: true,
    data,
  };
}
