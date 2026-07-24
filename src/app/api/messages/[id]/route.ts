import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { publish } from "@/lib/bus";
import { assertSameOrigin } from "@/lib/security";
import { channelAudience, isChannelMember } from "@/lib/dm";
import { messageSchema } from "@/lib/validations";
import { serializeMessage } from "@/lib/serialize";

export const runtime = "nodejs";

// PATCH /api/messages/:id  { body }  -> edit a message (author only).
export async function PATCH(
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
  const parsed = messageSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: { channel: true },
  });
  if (!message || message.deletedAt) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }
  if (
    message.channel.isDm &&
    !(await isChannelMember(user.id, message.channelId))
  ) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }
  // Only the author may edit their own message.
  if (message.userId !== user.id) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const updated = await prisma.message.update({
    where: { id: messageId },
    data: { body: parsed.data.body, editedAt: new Date() },
    include: { user: true, reactions: true, channel: true },
  });

  const serialized = serializeMessage(updated);
  const audience = await channelAudience(message.channel);
  publish({
    type: "message-update",
    channelId: message.channelId,
    message: serialized,
    ...(audience ? { audience } : {}),
  });
  return NextResponse.json({ message: serialized });
}

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
