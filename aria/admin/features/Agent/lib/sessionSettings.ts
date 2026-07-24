import type { AgentSessionModelOverride, InferenceBackendId } from "./schemas";

export function buildSessionModelOverride(input: {
  inferenceProvider?: AgentSessionModelOverride["inferenceProvider"];
  modelId?: string;
  siteInferenceProvider?: InferenceBackendId;
  siteModelId?: string;
}): AgentSessionModelOverride | undefined {
  const override: AgentSessionModelOverride = {};
  const providerChanged =
    Boolean(input.inferenceProvider) &&
    input.inferenceProvider !== input.siteInferenceProvider;
  const modelId = input.modelId?.trim();
  const modelChanged =
    Boolean(modelId) && modelId !== input.siteModelId?.trim();

  if (providerChanged && input.inferenceProvider) {
    override.inferenceProvider = input.inferenceProvider;
  }

  if (modelChanged && modelId) {
    // The server cannot safely resolve a model-only override when multiple
    // providers are enabled. Include the selected provider even when it is
    // also the site default so the model shown in the UI is the model used.
    if (input.inferenceProvider) {
      override.inferenceProvider = input.inferenceProvider;
    }
    override.modelId = modelId;
  }

  if (Object.keys(override).length === 0) {
    return undefined;
  }

  return override;
}
