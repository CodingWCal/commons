import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { publish } from "@/lib/bus";
import { assertSameOrigin } from "@/lib/security";
import { channelAudience, isChannelMember } from "@/lib/dm";

export const runtime = "nodejs";

// DELETE /api/messages/:id  -> soft-delete a message (author or admin only).
export async function DELETE(
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

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: { channel: true },
  });
  if (!message || message.deletedAt) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  const isOwner = message.userId === user.id;
  if (message.channel.isDm) {
    // Private DM: must be a member, and only the author may delete (admins
    // don't moderate private conversations).
    if (!(await isChannelMember(user.id, message.channelId))) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }
    if (!isOwner) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }
  } else if (!isOwner && user.role !== "admin") {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  await prisma.message.update({
    where: { id: messageId },
    data: { deletedAt: new Date() },
  });

  const audience = await channelAudience(message.channel);
  publish({
    type: "message-delete",
    channelId: message.channelId,
    messageId,
    ...(audience ? { audience } : {}),
  });
  return NextResponse.json({ ok: true });
}
