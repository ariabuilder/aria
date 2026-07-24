export class CmsActionTimeoutError extends Error {
  constructor(label: string, timeoutMs: number) {
    super(`${label} timed out after ${timeoutMs}ms`);
    this.name = "CmsActionTimeoutError";
  }
}

export async function withCmsActionTimeout<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs = 15000,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new CmsActionTimeoutError(label, timeoutMs));
    }, timeoutMs);
  });

  return await Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}
