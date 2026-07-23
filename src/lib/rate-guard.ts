// Per-user sliding-window rate guard to prevent accidental message floods.
//
// PROTOTYPE ONLY: in-memory + single-process. For production, replace with a
// distributed token bucket (e.g. Redis) so limits hold across instances.
const globalForRate = globalThis as unknown as {
  commonsRate?: Map<string, number[]>;
};

const hits =
  globalForRate.commonsRate ?? (globalForRate.commonsRate = new Map<string, number[]>());

const WINDOW_MS = 5_000;
const MAX_IN_WINDOW = 10;

export function allowMessage(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_IN_WINDOW) {
    hits.set(userId, recent);
    return false;
  }
  recent.push(now);
  hits.set(userId, recent);
  return true;
}
