import { describe, expect, it } from "vitest";
import { AGENT_MAX_STEPS } from "../../../admin/features/Agent/lib/constants";
import {
  AGENT_MAX_STEPS as AGENT_MAX_STEPS_FROM_INFERENCE,
  PROVIDER_TIMEOUT_MS,
} from "../../../admin/features/Agent/server/inference";

describe("AGENT_MAX_STEPS", () => {
  it("is high enough for CMS inventory + relations + create", () => {
    expect(AGENT_MAX_STEPS).toBe(16);
    expect(AGENT_MAX_STEPS_FROM_INFERENCE).toBe(AGENT_MAX_STEPS);
  });

  it("allows an accepted provider request up to two minutes", () => {
    expect(PROVIDER_TIMEOUT_MS).toBe(120_000);
  });
});
