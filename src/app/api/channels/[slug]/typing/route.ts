import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, toSerializedUser } from "@/lib/auth";
import { publish } from "@/lib/bus";
import { assertSameOrigin } from "@/lib/security";
import { allowTyping } from "@/lib/rate-guard";
import { channelAudience, isChannelMember } from "@/lib/dm";

export const runtime = "nodejs";

// POST /api/channels/:slug/typing -> broadcast an ephemeral "typing" ping.
// Not persisted; clients throttle how often they call this.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;

  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  if (!allowTyping(auth.user.id)) {
    return NextResponse.json({ ok: true }); // silently drop excess typing pings
  }

  const { slug } = await params;
  const channel = await prisma.channel.findUnique({ where: { slug } });
  if (!channel) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }
  if (channel.isDm && !(await isChannelMember(auth.user.id, channel.id))) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  const audience = await channelAudience(channel);
  publish({
    type: "typing",
    channelId: channel.id,
    user: toSerializedUser(auth.user),
    ...(audience ? { audience } : {}),
  });
  return NextResponse.json({ ok: true });
}
