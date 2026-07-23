import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { onlineUsers } from "@/lib/presence";
import AppShell from "@/components/AppShell";
import type { SerializedChannel, SerializedMessage } from "@/lib/types";

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

  const channelRows = await prisma.channel.findMany();
  const channels: SerializedChannel[] = orderChannels(channelRows).map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
  }));

  // Deep-link: open the channel named in ?c=slug, else the first channel.
  const { c } = await searchParams;
  const active =
    (c ? channels.find((ch) => ch.slug === c) : undefined) ?? channels[0] ?? null;

  let initialMessages: SerializedMessage[] = [];
  if (active) {
    const rows = await prisma.message.findMany({
      where: { channelId: active.id },
      orderBy: { id: "desc" },
      take: 50,
      include: { user: true },
    });
    initialMessages = rows.reverse().map((m) => ({
      id: m.id,
      body: m.body,
      channelId: m.channelId,
      createdAt: m.createdAt.toISOString(),
      user: {
        id: m.user.id,
        displayName: m.user.displayName,
        avatarColor: m.user.avatarColor,
      },
    }));
  }

  return (
    <AppShell
      currentUser={{
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        avatarColor: user.avatarColor,
      }}
      channels={channels}
      initialActiveChannelId={active?.id ?? null}
      initialMessages={initialMessages}
      initialOnline={onlineUsers()}
    />
  );
}
