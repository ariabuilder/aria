import { describe, expect, it } from "vitest";
import {
  activityForStreamEvent,
  activityForToolSteps,
  completeAgentRunTelemetry,
  createAgentActivityState,
  createAgentRunTelemetry,
  fallbackContentForToolOnlyRun,
  labelForTurnStatus,
  labelForToolName,
  markAgentRunTelemetry,
} from "../../../admin/features/Agent/lib/activity";

describe("agent activity", () => {
  it("creates user-facing activity state", () => {
    expect(
      createAgentActivityState("thinking", "Thinking...", {
        requestId: "req-1",
        now: 1000,
      }),
    ).toEqual({
      phase: "thinking",
      label: "Thinking...",
      startedAt: 1000,
      elapsedMs: 0,
      requestId: "req-1",
      activeToolName: undefined,
    });
  });

  it("maps stream events to visible phases", () => {
    expect(
      activityForStreamEvent({
        type: "tool-call",
        toolCallId: "call-1",
        toolName: "aria_read_page",
        args: {},
      })?.phase,
    ).toBe("reading");

    expect(
      activityForStreamEvent({
        type: "tool-call",
        toolCallId: "call-2",
        toolName: "aria_update_page_seo",
        args: {},
      })?.label,
    ).toBe("Updating SEO...");

    expect(
      activityForStreamEvent({ type: "text-delta", delta: "Hello" })?.phase,
    ).toBe("responding");
  });

  it("uses the run context before a concrete tool is known", () => {
    expect(
      labelForTurnStatus("generating", {
        mode: "ask",
        shellContext: {
          mode: "studio",
          workspace: "studio",
          itemType: null,
          itemSlug: null,
          itemTitle: null,
          pageId: null,
          selectedBlockId: null,
          blockCount: 0,
          canClientInsert: false,
          canClientNavigate: true,
        },
      }),
    ).toBe("Thinking about your question...");

    expect(
      labelForTurnStatus("generating", {
        mode: "agent",
        seoContext: {
          pageSlug: "blog",
          pageTitle: "Blog",
        },
      }),
    ).toBe("Reviewing SEO for Blog...");

    expect(
      labelForTurnStatus("generating", {
        mode: "agent",
        shellContext: {
          mode: "composer",
          workspace: "composer",
          itemType: "page",
          itemSlug: "home",
          itemTitle: "Home",
          pageId: "home",
          selectedBlockId: null,
          blockCount: 1,
          canClientInsert: true,
          canClientNavigate: true,
        },
      }),
    ).toBe("Reviewing the current design...");
  });

  it("only uses section wording after a canvas build starts", () => {
    expect(
      labelForTurnStatus("generating", {
        mode: "agent",
        canvasBuildStarted: true,
        completedSections: 0,
      }),
    ).toBe("Designing the first section...");
    expect(
      labelForTurnStatus("generating", {
        mode: "agent",
        canvasBuildStarted: true,
        completedSections: 2,
      }),
    ).toBe("Designing section 3...");
  });

  it("uses running tool steps before completed ones", () => {
    expect(
      activityForToolSteps([
        {
          id: "read",
          toolName: "aria_read_page",
          status: "success",
          isReadTool: true,
        },
        {
          id: "insert",
          toolName: "insert_nodes",
          status: "running",
          isReadTool: false,
        },
      ])?.label,
    ).toBe("Adding page content...");
  });

  it("has compact labels for broad site context", () => {
    expect(labelForToolName("aria_get_site_context")).toBe(
      "Reading site context...",
    );
  });

  it("keeps tool-only write runs from looking like empty responses", () => {
    expect(
      fallbackContentForToolOnlyRun([
        {
          id: "open",
          toolName: "open_in_composer",
          status: "success",
          isReadTool: false,
        },
        {
          id: "insert",
          toolName: "insert_nodes",
          status: "success",
          isReadTool: false,
        },
      ]),
    ).toBe("Done - I made the requested update.");
  });

  it("uses a retry fallback for blank streams with no tool activity", () => {
    expect(fallbackContentForToolOnlyRun([])).toBe(
      "I didn't receive a usable response from the model. Please try again.",
    );
  });

  it("uses a softer fallback for tool-only read runs", () => {
    expect(
      fallbackContentForToolOnlyRun([
        {
          id: "read",
          toolName: "aria_read_page",
          status: "success",
          isReadTool: true,
        },
      ]),
    ).toBe(
      "I inspected the site, but the model ended before sending a final response. Please try again.",
    );
  });

  it("surfaces step-limit finishes when only CMS reads completed", () => {
    expect(
      fallbackContentForToolOnlyRun(
        [
          {
            id: "inventory",
            toolName: "aria_get_cms_inventory",
            status: "success",
            isReadTool: true,
          },
        ],
        { finishReason: "length" },
      ),
    ).toBe(
      "I inspected the site but hit a step limit before applying the change. Please try again and ask me to create or update the entry directly.",
    );

    expect(
      activityForStreamEvent({
        type: "finish",
        finishReason: "length",
      })?.label,
    ).toBe("Hit step or token limit...");
  });
});

describe("agent run telemetry", () => {
  it("records first-event, first-token, tool, and total durations", () => {
    let telemetry = createAgentRunTelemetry("req-1", 10);
    telemetry = markAgentRunTelemetry(telemetry, "requestSentAt", 20);
    telemetry = markAgentRunTelemetry(telemetry, "firstStreamEventAt", 30);
    telemetry = markAgentRunTelemetry(telemetry, "firstToolCallAt", 40);
    telemetry = markAgentRunTelemetry(telemetry, "firstToolResultAt", 55);
    telemetry = markAgentRunTelemetry(telemetry, "firstTextDeltaAt", 70);
    telemetry = completeAgentRunTelemetry(telemetry, 100);

    expect(telemetry.durations).toMatchObject({
      preflightMs: 10,
      firstEventMs: 20,
      firstTextMs: 60,
      toolRoundTripMs: 15,
      totalMs: 90,
    });
  });

  it("keeps the first mark when the same event happens repeatedly", () => {
    let telemetry = createAgentRunTelemetry("req-1", 0);
    telemetry = markAgentRunTelemetry(telemetry, "firstTextDeltaAt", 10);
    telemetry = markAgentRunTelemetry(telemetry, "firstTextDeltaAt", 20);

    expect(telemetry.firstTextDeltaAt).toBe(10);
    expect(telemetry.durations.firstTextMs).toBe(10);
  });
});
