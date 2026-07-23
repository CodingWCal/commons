import { prisma } from "./prisma";
import type { SerializedChannel } from "./types";

// Deterministic slug so a DM between two users always resolves to one channel.
export function dmSlug(a: string, b: string): string {
  return `dm-${[a, b].sort().join("-")}`;
}

export async function getOrCreateDm(meId: string, otherId: string) {
  const slug = dmSlug(meId, otherId);
  const existing = await prisma.channel.findUnique({ where: { slug } });
  if (existing) return existing;
  try {
    return await prisma.channel.create({
      data: {
        slug,
        name: "Direct message",
        isDm: true,
        members: { create: [{ userId: meId }, { userId: otherId }] },
      },
    });
  } catch {
    // Lost a create race on the unique slug — fetch the winner.
    const channel = await prisma.channel.findUnique({ where: { slug } });
    if (!channel) throw new Error("Failed to create DM");
    return channel;
  }
}

export async function isChannelMember(userId: string, channelId: string): Promise<boolean> {
  const membership = await prisma.membership.findUnique({
    where: { userId_channelId: { userId, channelId } },
  });
  return Boolean(membership);
}

// The SSE audience for a channel: member ids for a DM, null for a public channel.
export async function channelAudience(channel: {
  id: string;
  isDm: boolean;
}): Promise<string[] | null> {
  if (!channel.isDm) return null;
  const members = await prisma.membership.findMany({
    where: { channelId: channel.id },
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}

type ChannelWithMembers = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isDm: boolean;
  members: { user: { id: string; displayName: string; avatarColor: string } }[];
};

// Serialize a DM for a specific viewer: the display name/partner is the *other*
// participant.
export function serializeDmForViewer(
  channel: ChannelWithMembers,
  viewerId: string,
): SerializedChannel {
  const other = channel.members.find((m) => m.user.id !== viewerId)?.user;
  const partner = other
    ? { id: other.id, displayName: other.displayName, avatarColor: other.avatarColor }
    : null;
  return {
    id: channel.id,
    slug: channel.slug,
    name: partner?.displayName ?? "Direct message",
    description: null,
    isDm: true,
    partner,
  };
}
