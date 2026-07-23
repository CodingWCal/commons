import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { messageSchema } from "@/lib/validations";
import { publish } from "@/lib/bus";
import { allowMessage } from "@/lib/rate-guard";
import { assertSameOrigin } from "@/lib/security";
import { serializeMessage } from "@/lib/serialize";
import { channelAudience, isChannelMember } from "@/lib/dm";

export const runtime = "nodejs";

const PAGE_SIZE = 50;
const BACKFILL_LIMIT = 500;

async function getChannel(slug: string) {
  return prisma.channel.findUnique({ where: { slug } });
}

// GET /api/channels/:slug/messages            -> most recent page (ascending)
// GET /api/channels/:slug/messages?before=42  -> older page before id 42
// GET /api/channels/:slug/messages?after=42   -> everything after id 42 (SSE backfill)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const { slug } = await params;
  const channel = await getChannel(slug);
  if (!channel) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }
  // Private DM: only members may read (404, not 403, to avoid disclosing it).
  if (channel.isDm && !(await isChannelMember(auth.user.id, channel.id))) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  const params_ = new URL(req.url).searchParams;
  const afterRaw = params_.get("after");
  const beforeRaw = params_.get("before");
  const after = afterRaw ? Number(afterRaw) : NaN;
  const before = beforeRaw ? Number(beforeRaw) : NaN;

  const notDeleted = { channelId: channel.id, deletedAt: null };
  const include = { user: true, reactions: true } as const;

  // Backfill: strictly ascending, no "hasMore" semantics.
  if (Number.isFinite(after)) {
    const rows = await prisma.message.findMany({
      where: { ...notDeleted, id: { gt: after } },
      orderBy: { id: "asc" },
      take: BACKFILL_LIMIT,
      include,
    });
    return NextResponse.json({ messages: rows.map(serializeMessage), hasMore: false });
  }

  // Page: newest page by default, or the page immediately before `before`.
  const where = Number.isFinite(before)
    ? { ...notDeleted, id: { lt: before } }
    : notDeleted;

  const rows = await prisma.message.findMany({
    where,
    orderBy: { id: "desc" },
    take: PAGE_SIZE + 1, // one extra to detect older history
    include,
  });

  const hasMore = rows.length > PAGE_SIZE;
  const page = rows.slice(0, PAGE_SIZE).reverse(); // ascending for display
  return NextResponse.json({ messages: page.map(serializeMessage), hasMore });
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
  const channel = await getChannel(slug);
  if (!channel) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }
  if (channel.isDm && !(await isChannelMember(user.id, channel.id))) {
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
    include: { user: true, reactions: true },
  });

  const message = serializeMessage(created);
  const audience = await channelAudience(channel);
  publish({
    type: "message",
    channelId: channel.id,
    message,
    nonce: parsed.data.nonce,
    ...(audience ? { audience } : {}),
  });

  return NextResponse.json({ message });
}
