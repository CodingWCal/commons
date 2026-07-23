import { EventEmitter } from "node:events";
import type { BusEvent } from "./types";

// In-process pub/sub for real-time fan-out.
//
// PROTOTYPE ONLY: this bus lives in a single Node process, so it fans out
// correctly on one instance (local dev, or a single-node host like
// Render/Railway/Fly). For multi-instance production (e.g. Vercel serverless),
// replace this with a durable transport — Postgres LISTEN/NOTIFY or Redis
// pub/sub — keeping the same publish()/subscribe() surface.
const globalForBus = globalThis as unknown as { commonsBus?: EventEmitter };

const emitter =
  globalForBus.commonsBus ?? (globalForBus.commonsBus = new EventEmitter());

// One listener per open SSE connection; lift the default 10-listener cap.
emitter.setMaxListeners(0);

const CHANNEL = "event";

export function publish(event: BusEvent): void {
  emitter.emit(CHANNEL, event);
}

export function subscribe(handler: (event: BusEvent) => void): () => void {
  emitter.on(CHANNEL, handler);
  return () => {
    emitter.off(CHANNEL, handler);
  };
}
