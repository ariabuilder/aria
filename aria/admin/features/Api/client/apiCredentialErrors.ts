const API_KEYRING_CONFIGURATION_ERRORS = new Set([
  "API_KEYRING_KEY_ID_UNAVAILABLE",
  "API_KEYRING_KEY_ID_INVALID",
  "API_KEYRING_KEY_UNAVAILABLE",
  "API_KEYRING_KEY_INVALID",
]);

export function isApiKeyringConfigurationError(cause: unknown): boolean {
  return (
    cause instanceof Error &&
    API_KEYRING_CONFIGURATION_ERRORS.has(cause.message)
  );
}
