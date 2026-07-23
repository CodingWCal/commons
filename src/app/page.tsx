import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { onlineUsers } from "@/lib/presence";
import { serializeMessage } from "@/lib/serialize";
import { serializeDmForViewer } from "@/lib/dm";
import AppShell from "@/components/AppShell";
import type { SerializedChannel, SerializedMessage } from "@/lib/types";

const PAGE_SIZE = 50;

export const dynamic = "force-dynamic";

function orderChannels<T extends { slug: string; name: string }>(channels: T[]): T[] {
  return [...channels].sort((a, b) => {
    if (a.slug === "general") return -1;
    if (b.slug === "general") return 1;
    return a.name.localeCompare(b.name);
  });
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const channelRows = await prisma.channel.findMany({ where: { isDm: false } });
  const channels: SerializedChannel[] = orderChannels(channelRows).map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    isDm: false,
  }));

  const dmRows = await prisma.channel.findMany({
    where: { isDm: true, members: { some: { userId: user.id } } },
    include: { members: { include: { user: true } } },
    orderBy: { createdAt: "desc" },
  });
  const dms: SerializedChannel[] = dmRows.map((c) => serializeDmForViewer(c, user.id));

  // Deep-link: open the channel/DM named in ?c=slug, else the first channel.
  const { c } = await searchParams;
  const active =
    (c ? [...channels, ...dms].find((ch) => ch.slug === c) : undefined) ??
    channels[0] ??
    null;

  let initialMessages: SerializedMessage[] = [];
  let initialHasMore = false;
  if (active) {
    const rows = await prisma.message.findMany({
      where: { channelId: active.id, deletedAt: null },
      orderBy: { id: "desc" },
      take: PAGE_SIZE + 1,
      include: { user: true, reactions: true },
    });
    initialHasMore = rows.length > PAGE_SIZE;
    initialMessages = rows.slice(0, PAGE_SIZE).reverse().map(serializeMessage);
  }

  return (
    <AppShell
      currentUser={{
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        avatarColor: user.avatarColor,
        role: user.role === "admin" ? "admin" : "member",
      }}
      channels={channels}
      dms={dms}
      initialActiveChannelId={active?.id ?? null}
      initialMessages={initialMessages}
      initialHasMore={initialHasMore}
      initialOnline={onlineUsers()}
    />
  );
}
