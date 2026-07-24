/**
 * Redirect management actions.
 */

import { defineAction, ActionError } from "astro:actions";
import { getStorageAdapterAsync } from "../lib/storage/getStorageAdapter";
import {
  CreateRedirectInputSchema,
  DeleteRedirectInputSchema,
  FlattenRedirectChainInputSchema,
  ImportRedirectsCsvInputSchema,
  ImportRedirectsCsvResponseSchema,
  ListRedirectTargetsResponseSchema,
  ListRedirectsInputSchema,
  ListRedirectsResponseSchema,
  RedirectRuleSchema,
  UpdateRedirectInputSchema,
} from "../lib/redirects/schemas";
import {
  createRedirectOnAdapter,
  deleteRedirectOnAdapter,
  getRedirectByIdFromAdapter,
  listRedirectsFromAdapter,
  updateRedirectOnAdapter,
} from "../lib/redirects/storage";
import { flattenRedirectChainTarget } from "../lib/redirects/flattenChain";
import { validateRedirectRule } from "../lib/redirects/validate";
import {
  listRedirectTargets,
  loadRedirectTargetPaths,
} from "../lib/redirects/targets";
import { requireOperation, resolveAuthorizedMutation } from "./_shared";

export const redirects = {
  list: defineAction({
    accept: "json",
    input: ListRedirectsInputSchema,
    handler: async (input, context) => {
      await requireOperation(context, "redirects.list");
      const adapter = await getStorageAdapterAsync(context.locals);
      const redirectsList = await listRedirectsFromAdapter(adapter, input);
      return ListRedirectsResponseSchema.parse({ redirects: redirectsList });
    },
  }),

  listTargets: defineAction({
    accept: "json",
    handler: async (_, context) => {
      await requireOperation(context, "redirects.listTargets");
      const adapter = await getStorageAdapterAsync(context.locals);
      const targets = await listRedirectTargets(adapter);
      return ListRedirectTargetsResponseSchema.parse({ targets });
    },
  }),

  create: defineAction({
    accept: "json",
    input: CreateRedirectInputSchema,
    handler: async (input, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "redirects.create",
        "redirect-create",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      const existing = await listRedirectsFromAdapter(adapter, {
        includeDisabled: true,
      });
      const livePaths = await loadRedirectTargetPaths(adapter);
      const candidate = {
        fromPath: input.fromPath,
        toPath: input.toPath,
        statusCode: input.statusCode ?? 301,
        enabled: input.enabled ?? true,
      };
      const errors = validateRedirectRule(candidate, {
        existingRules: existing,
        livePaths,
      });
      if (errors.length > 0) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: errors.map((error) => error.message).join(" "),
        });
      }

      const rule = await createRedirectOnAdapter(
        adapter,
        input,
        authorship.actor.id,
      );
      await adapter.appendSettingsAuditEntry({
        category: "redirects",
        action: "create",
        actorId: authorship.actor.id,
        actorUsername: authorship.actor.username,
        summary: `Created redirect ${rule.fromPath} → ${rule.toPath}`,
        payload: { id: rule.id },
      });
      return RedirectRuleSchema.parse(rule);
    },
  }),

  update: defineAction({
    accept: "json",
    input: UpdateRedirectInputSchema,
    handler: async (input, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "redirects.update",
        "redirect-update",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      const current = await getRedirectByIdFromAdapter(adapter, input.id);
      if (!current) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Redirect not found",
        });
      }
      const existing = await listRedirectsFromAdapter(adapter, {
        includeDisabled: true,
      });
      const livePaths = await loadRedirectTargetPaths(adapter);
      const merged = {
        fromPath: input.fromPath ?? current.fromPath,
        toPath: input.toPath ?? current.toPath,
        statusCode: input.statusCode ?? current.statusCode,
        enabled: input.enabled ?? current.enabled,
      };
      const isDisablingOnly =
        input.enabled === false &&
        input.fromPath === undefined &&
        input.toPath === undefined &&
        input.statusCode === undefined &&
        input.note === undefined;
      const errors = validateRedirectRule(
        merged,
        {
          existingRules: existing,
          livePaths,
        },
        { excludeId: input.id, allowDisabledInvalid: isDisablingOnly },
      );
      if (errors.length > 0) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: errors.map((error) => error.message).join(" "),
        });
      }

      const rule = await updateRedirectOnAdapter(adapter, input);
      await adapter.appendSettingsAuditEntry({
        category: "redirects",
        action: "update",
        actorId: authorship.actor.id,
        actorUsername: authorship.actor.username,
        summary: `Updated redirect ${rule.fromPath} → ${rule.toPath}`,
        payload: { id: rule.id },
      });
      return RedirectRuleSchema.parse(rule);
    },
  }),

  delete: defineAction({
    accept: "json",
    input: DeleteRedirectInputSchema,
    handler: async (input, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "redirects.delete",
        "redirect-delete",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      const current = await getRedirectByIdFromAdapter(adapter, input.id);
      if (!current) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Redirect not found",
        });
      }
      await deleteRedirectOnAdapter(adapter, input.id);
      await adapter.appendSettingsAuditEntry({
        category: "redirects",
        action: "delete",
        actorId: authorship.actor.id,
        actorUsername: authorship.actor.username,
        summary: `Deleted redirect ${current.fromPath}`,
        payload: { id: input.id },
      });
      return { success: true as const };
    },
  }),

  flattenChain: defineAction({
    accept: "json",
    input: FlattenRedirectChainInputSchema,
    handler: async (input, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "redirects.flattenChain",
        "redirect-flatten",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      const current = await getRedirectByIdFromAdapter(adapter, input.id);
      if (!current) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Redirect not found",
        });
      }
      const existing = await listRedirectsFromAdapter(adapter, {
        includeDisabled: true,
      });
      const target = flattenRedirectChainTarget(current.fromPath, existing);
      if (!target) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Unable to flatten redirect chain.",
        });
      }
      const rule = await updateRedirectOnAdapter(adapter, {
        id: current.id,
        toPath: target,
      });
      await adapter.appendSettingsAuditEntry({
        category: "redirects",
        action: "flattenChain",
        actorId: authorship.actor.id,
        actorUsername: authorship.actor.username,
        summary: `Flattened redirect ${current.fromPath} → ${target}`,
        payload: { id: rule.id },
      });
      return RedirectRuleSchema.parse(rule);
    },
  }),

  importCsv: defineAction({
    accept: "json",
    input: ImportRedirectsCsvInputSchema,
    handler: async (input, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "redirects.importCsv",
        "redirect-import-csv",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      const livePaths = await loadRedirectTargetPaths(adapter);
      let existing = await listRedirectsFromAdapter(adapter, {
        includeDisabled: true,
      });

      if (input.replaceExisting) {
        for (const rule of existing) {
          await deleteRedirectOnAdapter(adapter, rule.id);
        }
        existing = [];
      }

      const lines = input.csv
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#"));

      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const [index, line] of lines.entries()) {
        const parts = line.split(",").map((part) => part.trim());
        const fromPath = parts[0];
        const toPath = parts[1];
        const statusCodeRaw = parts[2];
        if (!fromPath || !toPath) {
          errors.push(`Line ${index + 1}: expected from,to[,status]`);
          skipped += 1;
          continue;
        }

        const statusCode =
          statusCodeRaw === "302"
            ? 302
            : statusCodeRaw === "301" || !statusCodeRaw
              ? 301
              : null;
        if (statusCode === null) {
          errors.push(`Line ${index + 1}: invalid status code`);
          skipped += 1;
          continue;
        }

        const candidate: {
          fromPath: string;
          toPath: string;
          statusCode: 301 | 302;
          enabled: boolean;
        } = { fromPath, toPath, statusCode, enabled: true };
        const validationErrors = validateRedirectRule(candidate, {
          existingRules: existing,
          livePaths,
        });
        if (validationErrors.length > 0) {
          errors.push(
            `Line ${index + 1}: ${validationErrors[0]?.message ?? "Invalid redirect"}`,
          );
          skipped += 1;
          continue;
        }

        const created = await createRedirectOnAdapter(adapter, candidate);
        existing = [...existing, created];
        imported += 1;
      }

      await adapter.appendSettingsAuditEntry({
        category: "redirects",
        action: "importCsv",
        actorId: authorship.actor.id,
        actorUsername: authorship.actor.username,
        summary: `Imported ${imported} redirects from CSV`,
        payload: { imported, skipped, errorCount: errors.length },
      });

      return ImportRedirectsCsvResponseSchema.parse({
        imported,
        skipped,
        errors,
      });
    },
  }),
};
