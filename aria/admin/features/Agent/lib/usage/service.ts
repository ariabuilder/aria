import type { RuntimeLocals } from "../../../../../lib/cloudflare/env";
import {
  NormalizedInferenceUsageSchema,
  StartInferenceRunInputSchema,
  type CompleteInferenceRunInput,
  type NormalizedInferenceUsage,
  type StartInferenceRunInput,
} from "./schemas";
import { AiUsageRepository } from "./repository";

export function normalizeAiSdkUsage(input: {
  inputTokens?: number;
  outputTokens?: number;
}): NormalizedInferenceUsage {
  return NormalizedInferenceUsageSchema.parse({
    inputTokens: input.inputTokens ?? null,
    outputTokens: input.outputTokens ?? null,
  });
}

export class AiUsageRun {
  private completed = false;

  constructor(
    private readonly repository: AiUsageRepository,
    readonly id: string,
  ) {}

  async complete(input: Omit<CompleteInferenceRunInput, "runId">): Promise<void> {
    if (this.completed) return;
    await this.repository.completeRun({ ...input, runId: this.id });
    this.completed = true;
  }
}

export async function startAiUsageRun(
  locals: RuntimeLocals | App.Locals,
  input: StartInferenceRunInput,
): Promise<AiUsageRun> {
  const repository = new AiUsageRepository(locals);
  const run = await repository.startRun(StartInferenceRunInputSchema.parse(input));
  return new AiUsageRun(repository, run.id);
}
