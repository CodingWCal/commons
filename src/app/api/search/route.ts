import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

const LIMIT = 30;
const MIN_QUERY = 2;

// GET /api/search?q=term -> recent messages whose body contains `term`.
// SQLite `contains` is case-insensitive for ASCII. Excludes deleted messages.
export async function GET(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < MIN_QUERY) {
    return NextResponse.json({ results: [] });
  }

  const rows = await prisma.message.findMany({
    // Search only public channels — never leak private DMs.
    where: { deletedAt: null, body: { contains: q }, channel: { isDm: false } },
    orderBy: { id: "desc" },
    take: LIMIT,
    include: { user: true, channel: true },
  });

  const results = rows.map((m) => ({
    id: m.id,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    user: {
      id: m.user.id,
      displayName: m.user.displayName,
      avatarColor: m.user.avatarColor,
    },
    channel: { slug: m.channel.slug, name: m.channel.name },
  }));

  return NextResponse.json({ results });
}
