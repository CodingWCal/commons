import type { ReactionSummary, SerializedMessage } from "./types";

type ReactionRow = { emoji: string; userId: string };

type MessageRow = {
  id: number;
  body: string;
  channelId: string;
  createdAt: Date;
  user: { id: string; displayName: string; avatarColor: string };
  reactions?: ReactionRow[];
};

export function aggregateReactions(rows: ReactionRow[]): ReactionSummary[] {
  const byEmoji = new Map<string, string[]>();
  for (const r of rows) {
    const userIds = byEmoji.get(r.emoji) ?? [];
    userIds.push(r.userId);
    byEmoji.set(r.emoji, userIds);
  }
  return [...byEmoji.entries()].map(([emoji, userIds]) => ({
    emoji,
    count: userIds.length,
    userIds,
  }));
}

// Single source of truth for turning a Prisma message row into wire shape.
export function serializeMessage(m: MessageRow): SerializedMessage {
  return {
    id: m.id,
    body: m.body,
    channelId: m.channelId,
    createdAt: m.createdAt.toISOString(),
    user: {
      id: m.user.id,
      displayName: m.user.displayName,
      avatarColor: m.user.avatarColor,
    },
    reactions: aggregateReactions(m.reactions ?? []),
  };
}
