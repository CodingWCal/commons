import { getCurrentUser, toSerializedUser } from "@/lib/auth";
import { subscribe } from "@/lib/bus";
import { addConnection, removeConnection } from "@/lib/presence";
import { prisma } from "@/lib/prisma";
import { serializeMessage } from "@/lib/serialize";
import type { BusEvent, SerializedMessage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;
const BACKFILL_LIMIT = 500;

// Server-Sent Events stream: one long-lived connection per client. Pushes
// `message`, `channel`, and `presence` events. On reconnect, the browser
// replays its Last-Event-ID header and we backfill anything missed.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const me = toSerializedUser(user);
  const encoder = new TextEncoder();
  const lastEventId = Number(req.headers.get("last-event-id") ?? "0") || 0;

  let unsubscribe: () => void = () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let lastSentMessageId = lastEventId;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // controller already closed
        }
      };

      const sendEvent = (event: string, data: unknown, id?: number) => {
        let frame = "";
        if (id != null) frame += `id: ${id}\n`;
        frame += `event: ${event}\n`;
        frame += `data: ${JSON.stringify(data)}\n\n`;
        write(frame);
      };

      const sendMessage = (
        channelId: string,
        message: SerializedMessage,
        nonce?: string,
      ) => {
        if (message.id <= lastSentMessageId) return; // dedupe / ordering guard
        lastSentMessageId = message.id;
        sendEvent("message", { channelId, message, nonce }, message.id);
      };

      // Ask the browser to reconnect quickly if the stream drops.
      write("retry: 3000\n\n");

      // Subscribe first so nothing published during backfill is lost.
      unsubscribe = subscribe((event: BusEvent) => {
        // Scoped (private/DM) events only reach their audience.
        const audience = (event as { audience?: string[] }).audience;
        if (audience && !audience.includes(me.id)) return;

        if (event.type === "message") {
          sendMessage(event.channelId, event.message, event.nonce);
        } else if (event.type === "message-update") {
          sendEvent("message-update", {
            channelId: event.channelId,
            message: event.message,
          });
        } else if (event.type === "message-delete") {
          sendEvent("message-delete", {
            channelId: event.channelId,
            messageId: event.messageId,
          });
        } else if (event.type === "reaction") {
          sendEvent("reaction", {
            channelId: event.channelId,
            messageId: event.messageId,
            reactions: event.reactions,
          });
        } else if (event.type === "typing") {
          sendEvent("typing", { channelId: event.channelId, user: event.user });
        } else if (event.type === "channel") {
          sendEvent("channel", event.channel);
        } else if (event.type === "presence") {
          sendEvent("presence", { online: event.online });
        }
      });

      // Backfill messages missed while disconnected (skip deleted).
      if (lastEventId > 0) {
        const missed = await prisma.message.findMany({
          where: {
            id: { gt: lastEventId },
            deletedAt: null,
            // Never replay private DM messages to a non-member.
            OR: [
              { channel: { isDm: false } },
              { channel: { members: { some: { userId: me.id } } } },
            ],
          },
          orderBy: { id: "asc" },
          take: BACKFILL_LIMIT,
          include: { user: true, reactions: true },
        });
        for (const m of missed) {
          sendMessage(m.channelId, serializeMessage(m));
        }
      }

      // Mark online — this broadcasts presence to everyone, including us, which
      // doubles as our initial presence snapshot.
      addConnection(me);

      heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);

      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup();
    },
  });

  function cleanup() {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    unsubscribe();
    removeConnection(me.id);
  }

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
