import { publish } from "./bus";
import type { SerializedUser } from "./types";

// In-process presence tracker. Keyed by userId, ref-counted by open
// connections so multiple tabs from the same user count as one "online".
//
// PROTOTYPE ONLY: single-process, same caveat as the bus. In multi-instance
// production, back presence with a shared store (Redis with TTL heartbeats).
type Entry = { user: SerializedUser; connections: number };

const globalForPresence = globalThis as unknown as {
  commonsPresence?: Map<string, Entry>;
};

const registry =
  globalForPresence.commonsPresence ??
  (globalForPresence.commonsPresence = new Map<string, Entry>());

export function onlineUsers(): SerializedUser[] {
  return [...registry.values()]
    .map((e) => e.user)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function broadcast(): void {
  publish({ type: "presence", online: onlineUsers() });
}

export function addConnection(user: SerializedUser): void {
  const existing = registry.get(user.id);
  if (existing) {
    existing.connections += 1;
    existing.user = user; // refresh display name / color
  } else {
    registry.set(user.id, { user, connections: 1 });
  }
  broadcast();
}

export function removeConnection(userId: string): void {
  const existing = registry.get(userId);
  if (!existing) return;
  existing.connections -= 1;
  if (existing.connections <= 0) {
    registry.delete(userId);
  }
  broadcast();
}
