import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/security";
import { getOrCreateDm, serializeDmForViewer } from "@/lib/dm";

export const runtime = "nodejs";

const withMembers = {
  members: { include: { user: true } },
} as const;

// GET /api/dms -> the caller's direct-message conversations.
export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const channels = await prisma.channel.findMany({
    where: { isDm: true, members: { some: { userId: auth.user.id } } },
    include: withMembers,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    dms: channels.map((c) => serializeDmForViewer(c, auth.user.id)),
  });
}

// POST /api/dms { userId } -> open (or create) a DM with another user.
export async function POST(req: Request) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;

  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const otherId = (json as { userId?: unknown })?.userId;
  if (typeof otherId !== "string" || otherId === auth.user.id) {
    return NextResponse.json({ error: "Invalid user" }, { status: 400 });
  }

  const other = await prisma.user.findUnique({ where: { id: otherId } });
  if (!other) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const created = await getOrCreateDm(auth.user.id, otherId);
  const channel = await prisma.channel.findUnique({
    where: { id: created.id },
    include: withMembers,
  });
  if (!channel) {
    return NextResponse.json({ error: "Failed to open DM" }, { status: 500 });
  }

  return NextResponse.json({ channel: serializeDmForViewer(channel, auth.user.id) });
}
