import type {
  AgentComposerMode,
  AgentSeoContext,
  AgentShellContext,
  AgentStreamEvent,
  AgentToolStep,
} from "./schemas";
import type { AgentWsTurnStatusPhase } from "./wsChatProtocol";
import { isClientToolName } from "./toolStream";
import {
  isClassToolName,
  isContentWriteToolName,
  isDesignExtendedToolName,
  isReadToolName,
  isVariableToolName,
} from "./tools/constants";

export type AgentActivityPhase =
  | "preparing"
  | "connecting"
  | "thinking"
  | "reasoning"
  | "reading"
  | "writing"
  | "running_client_tool"
  | "responding"
  | "retrying"
  | "finalizing"
  | "stopped"
  | "error";

export interface AgentActivityState {
  phase: AgentActivityPhase;
  label: string;
  activeToolName?: string;
  startedAt: number;
  elapsedMs: number;
  requestId?: string;
}

export interface AgentActivityContext {
  mode: AgentComposerMode;
  shellContext?: AgentShellContext;
  seoContext?: AgentSeoContext;
  canvasBuildStarted?: boolean;
  completedSections?: number;
}

type AgentActivityScope =
  | "seo"
  | "composer"
  | "design"
  | "collections"
  | "studio";

function resolveActivityScope(
  context?: AgentActivityContext,
): AgentActivityScope {
  if (context?.seoContext) return "seo";
  switch (context?.shellContext?.workspace) {
    case "composer":
    case "design":
    case "collections":
      return context.shellContext.workspace;
    default:
      return "studio";
  }
}

function seoPageLabel(context: AgentActivityContext): string {
  const raw =
    context.seoContext?.pageTitle ?? context.seoContext?.pageSlug ?? "this page";
  return raw.length > 48 ? `${raw.slice(0, 45)}…` : raw;
}

export function labelForTurnStatus(
  phase: AgentWsTurnStatusPhase,
  context: AgentActivityContext,
): string {
  const completedSections = context.completedSections ?? 0;
  if (context.canvasBuildStarted) {
    if (phase === "generating") {
      return completedSections > 0
        ? `Designing section ${completedSections + 1}...`
        : "Designing the first section...";
    }
    return completedSections > 0
      ? "Preparing the next section..."
      : "Preparing the first section...";
  }

  const scope = resolveActivityScope(context);
  if (scope === "seo") {
    return phase === "accepted"
      ? "SEO request accepted..."
      : `Reviewing SEO for ${seoPageLabel(context)}...`;
  }
  if (scope === "composer") {
    return context.mode === "ask"
      ? "Thinking about the current design..."
      : "Reviewing the current design...";
  }
  if (scope === "design") {
    return "Reviewing the design system...";
  }
  if (scope === "collections") {
    return "Reviewing your content...";
  }
  if (context.mode === "ask") {
    return "Thinking about your question...";
  }
  return phase === "accepted"
    ? "Agent request accepted..."
    : "Preparing site changes...";
}

function labelForResponse(
  context: AgentActivityContext | undefined,
  phase: "responding" | "reviewing" | "finalizing",
): string {
  const scope = resolveActivityScope(context);
  const verb =
    phase === "responding"
      ? "Writing"
      : phase === "reviewing"
        ? "Reviewing"
        : "Finalizing";
  switch (scope) {
    case "seo":
      return `${verb} SEO response...`;
    case "composer":
      return `${verb} Composer response...`;
    case "design":
      return `${verb} design response...`;
    case "collections":
      return `${verb} content response...`;
    default:
      return `${verb} response...`;
  }
}

export interface AgentRunTelemetry {
  requestId: string;
  submittedAt: number;
  availabilityReadyAt?: number;
  settingsReadyAt?: number;
  transportConnectedAt?: number;
  requestSentAt?: number;
  firstStreamEventAt?: number;
  firstTextDeltaAt?: number;
  firstToolCallAt?: number;
  firstToolResultAt?: number;
  completedAt?: number;
  durations: {
    preflightMs?: number;
    firstEventMs?: number;
    firstTextMs?: number;
    toolRoundTripMs?: number;
    totalMs?: number;
  };
}

export type AgentTelemetryMark = Exclude<
  keyof AgentRunTelemetry,
  "requestId" | "durations"
>;

export function createAgentActivityState(
  phase: AgentActivityPhase,
  label: string,
  options: {
    activeToolName?: string;
    requestId?: string;
    now?: number;
  } = {},
): AgentActivityState {
  const now = options.now ?? Date.now();
  return {
    phase,
    label,
    activeToolName: options.activeToolName,
    startedAt: now,
    elapsedMs: 0,
    requestId: options.requestId,
  };
}

export function createAgentRunTelemetry(
  requestId: string,
  submittedAt = performanceNow(),
): AgentRunTelemetry {
  return {
    requestId,
    submittedAt,
    durations: {},
  };
}

export function markAgentRunTelemetry(
  telemetry: AgentRunTelemetry,
  mark: AgentTelemetryMark,
  at = performanceNow(),
): AgentRunTelemetry {
  const next: AgentRunTelemetry = { ...telemetry, durations: { ...telemetry.durations } };
  if (next[mark] === undefined) {
    (next as Record<AgentTelemetryMark, number | undefined>)[mark] = at;
  }
  return computeAgentRunDurations(next);
}

export function completeAgentRunTelemetry(
  telemetry: AgentRunTelemetry,
  at = performanceNow(),
): AgentRunTelemetry {
  return computeAgentRunDurations({
    ...telemetry,
    completedAt: telemetry.completedAt ?? at,
    durations: { ...telemetry.durations },
  });
}

export function activityForStreamEvent(
  event: AgentStreamEvent,
  options: {
    requestId?: string;
    now?: number;
    context?: AgentActivityContext;
  } = {},
): AgentActivityState | null {
  const stateOptions = {
    requestId: options.requestId,
    now: options.now,
  };
  switch (event.type) {
    case "text-delta":
      return createAgentActivityState(
        "responding",
        labelForResponse(options.context, "responding"),
        stateOptions,
      );
    case "reasoning":
      return createAgentActivityState("reasoning", "Thinking...", {
        ...stateOptions,
      });
    case "tool-call":
      return createAgentActivityState(
        phaseForToolName(event.toolName),
        labelForToolName(event.toolName),
        {
          ...stateOptions,
          activeToolName: event.toolName,
        },
      );
    case "tool-result":
      return createAgentActivityState(
        "thinking",
        labelForResponse(options.context, "reviewing"),
        {
          ...stateOptions,
          activeToolName: event.toolName,
        },
      );
    case "finish":
      if (event.finishReason === "length") {
        return createAgentActivityState(
          "finalizing",
          "Hit step or token limit...",
          {
            ...stateOptions,
          },
        );
      }
      return createAgentActivityState(
        "finalizing",
        labelForResponse(options.context, "finalizing"),
        stateOptions,
      );
    case "finished":
      return createAgentActivityState(
        "finalizing",
        labelForResponse(options.context, "finalizing"),
        stateOptions,
      );
    case "error":
      return createAgentActivityState("error", "Agent hit an error", {
        ...stateOptions,
      });
  }
}

export function activityForToolSteps(
  steps: readonly AgentToolStep[],
  options: {
    requestId?: string;
    now?: number;
    context?: AgentActivityContext;
  } = {},
): AgentActivityState | null {
  const stateOptions = {
    requestId: options.requestId,
    now: options.now,
  };
  const running = [...steps].reverse().find((step) => step.status === "running");
  if (running) {
    return createAgentActivityState(
      phaseForToolName(running.toolName),
      labelForToolName(running.toolName),
      {
        ...stateOptions,
        activeToolName: running.toolName,
      },
    );
  }

  const latest = steps.at(-1);
  if (!latest) {
    return null;
  }

  if (latest.status === "error") {
    return createAgentActivityState("error", "One step needs attention", {
      ...stateOptions,
      activeToolName: latest.toolName,
    });
  }

  return createAgentActivityState(
    "thinking",
    labelForResponse(options.context, "reviewing"),
    {
      ...stateOptions,
      activeToolName: latest.toolName,
    },
  );
}

export function fallbackContentForToolOnlyRun(
  steps: readonly AgentToolStep[],
  options: { finishReason?: string } = {},
): string | null {
  if (steps.length === 0) {
    return "I didn't receive a usable response from the model. Please try again.";
  }

  const hasError = steps.some((step) => step.status === "error");
  if (hasError) {
    return "I couldn't complete part of the request. Review the issue above and try again.";
  }

  const completed = steps.filter((step) => step.status === "success");
  if (completed.length === 0) {
    return "I started working, but the model ended before sending a final response. Please try again.";
  }

  const completedWrite = completed.some((step) => !step.isReadTool);
  if (completedWrite) {
    return "Done - I made the requested update.";
  }

  if (
    options.finishReason === "length" ||
    options.finishReason === "tool-calls"
  ) {
    return "I inspected the site but hit a step limit before applying the change. Please try again and ask me to create or update the entry directly.";
  }

  return "I inspected the site, but the model ended before sending a final response. Please try again.";
}

export function labelForToolName(toolName: string): string {
  switch (toolName) {
    case "aria_get_site_context":
      return "Reading site context...";
    case "aria_list_pages":
      return "Inspecting pages...";
    case "aria_read_page":
      return "Reading page...";
    case "aria_list_components":
      return "Inspecting components...";
    case "aria_read_component":
      return "Reading component...";
    case "aria_list_layouts":
      return "Inspecting layouts...";
    case "aria_read_layout":
      return "Reading layout...";
    case "aria_get_design_system":
      return "Checking design system...";
    case "aria_get_cms_inventory":
    case "aria_list_collections":
    case "aria_get_collection":
    case "aria_list_entries":
    case "aria_get_entry":
    case "aria_query_entries":
    case "aria_list_entry_revisions":
    case "aria_get_entry_revision":
      return "Inspecting CMS...";
    case "aria_list_element_types":
    case "aria_get_node_capabilities":
      return "Checking page structure...";
    case "aria_list_media":
      return "Checking media library...";
    case "aria_update_page_seo":
      return "Updating SEO...";
    case "aria_save_document":
      return "Saving page...";
    case "aria_update_page_meta":
      return "Updating page settings...";
    case "aria_insert_nodes":
    case "insert_nodes":
      return "Adding page content...";
    case "insert_designed_section":
      return "Designing section...";
    case "open_in_composer":
      return "Opening Composer...";
    case "select_block":
      return "Selecting content...";
    case "update_node_motion":
      return "Applying motion...";
    case "upload_custom_font":
      return "Uploading font...";
    case "aria_publish_page":
      return "Publishing page...";
    case "aria_unpublish_page":
      return "Unpublishing page...";
    case "aria_archive_page":
      return "Archiving page...";
    case "aria_unarchive_page":
      return "Unarchiving page...";
    case "aria_publish_entry":
      return "Publishing entry...";
    case "aria_unpublish_entry":
      return "Unpublishing entry...";
    case "aria_archive_entry":
      return "Archiving entry...";
    case "aria_create_collection":
    case "aria_update_collection":
    case "aria_set_collection_template":
    case "aria_clear_collection_template":
    case "aria_delete_collection":
    case "aria_create_entry":
    case "aria_update_entry":
    case "aria_duplicate_entry":
    case "aria_delete_entry":
    case "aria_restore_entry_revision":
    case "aria_bind_node_field":
    case "aria_set_container_loop":
    case "aria_setup_blog":
    case "aria_setup_tag_archive":
    case "aria_setup_nav_collection":
    case "aria_setup_config_collection":
      return "Updating CMS...";
  }

  if (isReadToolName(toolName)) return "Inspecting site...";
  if (isDesignExtendedToolName(toolName)) return "Updating design system...";
  if (isClassToolName(toolName)) return "Updating site styling...";
  if (isVariableToolName(toolName)) return "Updating site styling...";
  if (isContentWriteToolName(toolName)) return "Writing changes...";
  if (isClientToolName(toolName)) return "Running in Composer...";
  return "Working...";
}

function phaseForToolName(toolName: string): AgentActivityPhase {
  if (isClientToolName(toolName)) return "running_client_tool";
  if (isReadToolName(toolName)) return "reading";
  return "writing";
}

function computeAgentRunDurations(
  telemetry: AgentRunTelemetry,
): AgentRunTelemetry {
  const durations = { ...telemetry.durations };
  const preflightEnd =
    telemetry.requestSentAt ??
    telemetry.transportConnectedAt ??
    telemetry.settingsReadyAt ??
    telemetry.availabilityReadyAt;

  if (preflightEnd !== undefined) {
    durations.preflightMs = Math.max(0, preflightEnd - telemetry.submittedAt);
  }
  if (telemetry.firstStreamEventAt !== undefined) {
    durations.firstEventMs = Math.max(
      0,
      telemetry.firstStreamEventAt - telemetry.submittedAt,
    );
  }
  if (telemetry.firstTextDeltaAt !== undefined) {
    durations.firstTextMs = Math.max(
      0,
      telemetry.firstTextDeltaAt - telemetry.submittedAt,
    );
  }
  if (
    telemetry.firstToolCallAt !== undefined &&
    telemetry.firstToolResultAt !== undefined
  ) {
    durations.toolRoundTripMs = Math.max(
      0,
      telemetry.firstToolResultAt - telemetry.firstToolCallAt,
    );
  }
  if (telemetry.completedAt !== undefined) {
    durations.totalMs = Math.max(0, telemetry.completedAt - telemetry.submittedAt);
  }

  return { ...telemetry, durations };
}

function performanceNow(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}
