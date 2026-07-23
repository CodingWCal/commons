// Per-key sliding-window rate guard to prevent floods.
//
// PROTOTYPE ONLY: in-memory + single-process. For production, replace with a
// distributed token bucket (e.g. Redis) so limits hold across instances.
const globalForRate = globalThis as unknown as {
  commonsRate?: Map<string, number[]>;
};

const hits =
  globalForRate.commonsRate ?? (globalForRate.commonsRate = new Map<string, number[]>());

export function allow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

// Named limits per action, keyed by user.
export const allowMessage = (userId: string) => allow(`msg:${userId}`, 10, 5_000);
export const allowReaction = (userId: string) => allow(`react:${userId}`, 30, 5_000);
export const allowTyping = (userId: string) => allow(`typing:${userId}`, 10, 5_000);
