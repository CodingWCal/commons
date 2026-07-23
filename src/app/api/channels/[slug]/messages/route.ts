import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { messageSchema } from "@/lib/validations";
import { publish } from "@/lib/bus";
import { allowMessage } from "@/lib/rate-guard";
import { assertSameOrigin } from "@/lib/security";
import type { SerializedMessage } from "@/lib/types";

export const runtime = "nodejs";

const HISTORY_LIMIT = 50;
const BACKFILL_LIMIT = 500;

type MessageRow = {
  id: number;
  body: string;
  channelId: string;
  createdAt: Date;
  user: { id: string; displayName: string; avatarColor: string };
};

function serialize(m: MessageRow): SerializedMessage {
  return {
    id: m.id,
    body: m.body,
    channelId: m.channelId,
    createdAt: m.createdAt.toISOString(),
    user: {
      id: m.user.id,
      displayName: m.user.displayName,
      avatarColor: m.user.avatarColor,
    },
  };
}

// GET /api/channels/:slug/messages           -> most recent messages (ascending)
// GET /api/channels/:slug/messages?after=42  -> messages with id > 42 (ascending)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const { slug } = await params;
  const channel = await prisma.channel.findUnique({ where: { slug } });
  if (!channel) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  const afterRaw = new URL(req.url).searchParams.get("after");
  const after = afterRaw ? Number(afterRaw) : NaN;
  const hasAfter = Number.isFinite(after);

  const messages = await prisma.message.findMany({
    where: {
      channelId: channel.id,
      ...(hasAfter ? { id: { gt: after } } : {}),
    },
    orderBy: { id: hasAfter ? "asc" : "desc" },
    take: hasAfter ? BACKFILL_LIMIT : HISTORY_LIMIT,
    include: { user: true },
  });

  const ordered = hasAfter ? messages : messages.reverse();
  return NextResponse.json({ messages: ordered.map(serialize) });
}

// POST /api/channels/:slug/messages  -> create + broadcast a message
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;

  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const user = auth.user;

  const { slug } = await params;
  const channel = await prisma.channel.findUnique({ where: { slug } });
  if (!channel) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = messageSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  if (!allowMessage(user.id)) {
    return NextResponse.json(
      { error: "You're sending messages too quickly — slow down a moment." },
      { status: 429 },
    );
  }

  const created = await prisma.message.create({
    data: { body: parsed.data.body, channelId: channel.id, userId: user.id },
    include: { user: true },
  });

  const message = serialize(created);
  publish({
    type: "message",
    channelId: channel.id,
    message,
    nonce: parsed.data.nonce,
  });

  return NextResponse.json({ message });
}
