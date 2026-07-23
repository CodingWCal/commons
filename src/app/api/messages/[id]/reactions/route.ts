import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { publish } from "@/lib/bus";
import { assertSameOrigin } from "@/lib/security";
import { isReactionEmoji } from "@/lib/reactions";
import { aggregateReactions } from "@/lib/serialize";
import { allowReaction } from "@/lib/rate-guard";
import { channelAudience, isChannelMember } from "@/lib/dm";

export const runtime = "nodejs";

// POST /api/messages/:id/reactions  { emoji }  -> toggle the caller's reaction.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;

  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const user = auth.user;

  const { id } = await params;
  const messageId = Number(id);
  if (!Number.isInteger(messageId)) {
    return NextResponse.json({ error: "Invalid message id" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const emoji = (json as { emoji?: unknown })?.emoji;
  if (!isReactionEmoji(emoji)) {
    return NextResponse.json({ error: "Invalid reaction" }, { status: 400 });
  }

  if (!allowReaction(user.id)) {
    return NextResponse.json(
      { error: "You're reacting too quickly — slow down a moment." },
      { status: 429 },
    );
  }

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: { channel: true },
  });
  if (!message || message.deletedAt) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }
  if (message.channel.isDm && !(await isChannelMember(user.id, message.channelId))) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  // Toggle: remove if the caller already reacted with this emoji, else add.
  const existing = await prisma.reaction.findUnique({
    where: { messageId_userId_emoji: { messageId, userId: user.id, emoji } },
  });
  if (existing) {
    await prisma.reaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.reaction.create({ data: { messageId, userId: user.id, emoji } });
  }

  const rows = await prisma.reaction.findMany({ where: { messageId } });
  const reactions = aggregateReactions(rows);
  const audience = await channelAudience(message.channel);
  publish({
    type: "reaction",
    channelId: message.channelId,
    messageId,
    reactions,
    ...(audience ? { audience } : {}),
  });
  return NextResponse.json({ reactions });
}
