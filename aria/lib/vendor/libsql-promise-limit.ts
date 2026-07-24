type Task<T> = () => T | PromiseLike<T>;

type Limiter = <T>(task: Task<T>) => Promise<T>;

/**
 * ESM concurrency adapter for LibSQL's HTTP and WebSocket clients. LibSQL imports a
 * CommonJS package for this concern, which cannot run in a Cloudflare Worker.
 */
export default function createLimiter(concurrency?: number): Limiter {
  const maximum =
    Number.isFinite(concurrency) && (concurrency ?? 0) > 0
      ? Math.floor(concurrency as number)
      : Infinity;

  if (maximum === Infinity) {
    return <T>(task: Task<T>) => Promise.resolve().then(task) as Promise<T>;
  }

  let active = 0;
  const waiting: Array<() => void> = [];

  return <T>(task: Task<T>) =>
    new Promise<T>((resolve, reject) => {
      const start = () => {
        active += 1;
        Promise.resolve()
          .then(task)
          .then((result) => resolve(result as T), reject)
          .finally(() => {
            active -= 1;
            waiting.shift()?.();
          });
      };

      if (active < maximum) {
        start();
      } else {
        waiting.push(start);
      }
    });
}
