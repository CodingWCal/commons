import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { channelSchema } from "@/lib/validations";
import { slugify } from "@/lib/slug";
import { publish } from "@/lib/bus";
import { assertSameOrigin } from "@/lib/security";
import type { SerializedChannel } from "@/lib/types";

export const runtime = "nodejs";

type ChannelRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
};

function serialize(c: ChannelRow): SerializedChannel {
  return { id: c.id, slug: c.slug, name: c.name, description: c.description };
}

// #general always sorts first; everything else alphabetically.
function orderChannels(channels: ChannelRow[]): ChannelRow[] {
  return [...channels].sort((a, b) => {
    if (a.slug === "general") return -1;
    if (b.slug === "general") return 1;
    return a.name.localeCompare(b.name);
  });
}

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const channels = await prisma.channel.findMany();
  return NextResponse.json({ channels: orderChannels(channels).map(serialize) });
}

export async function POST(req: Request) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;

  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const user = auth.user;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = channelSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const slug = slugify(parsed.data.name);
  if (!slug) {
    return NextResponse.json(
      { error: "Use a name with at least one letter or number" },
      { status: 400 },
    );
  }

  const existing = await prisma.channel.findUnique({ where: { slug } });
  if (existing) {
    return NextResponse.json(
      { error: "A channel with a similar name already exists" },
      { status: 409 },
    );
  }

  const channel = await prisma.channel.create({
    data: {
      slug,
      name: parsed.data.name,
      description: parsed.data.description || null,
      createdById: user.id,
    },
  });

  const serialized = serialize(channel);
  publish({ type: "channel", channel: serialized });
  return NextResponse.json({ channel: serialized });
}
