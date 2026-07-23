// The fixed set of emoji users can react with (TICKET-010). Keeping it small
// and server-validated avoids arbitrary/oversized reaction payloads.
export const REACTION_EMOJI = ["👍", "❤️", "✅", "😂", "🎉", "👀"] as const;

export type ReactionEmoji = (typeof REACTION_EMOJI)[number];

export function isReactionEmoji(value: unknown): value is ReactionEmoji {
  return typeof value === "string" && (REACTION_EMOJI as readonly string[]).includes(value);
}
