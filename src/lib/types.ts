// Shared, transport-safe shapes. Everything sent to the client or over SSE
// uses these (dates as ISO strings, no Prisma internals).

export type SerializedUser = {
  id: string;
  displayName: string;
  avatarColor: string;
};

export type ReactionSummary = {
  emoji: string;
  count: number;
  userIds: string[]; // clients derive "did I react?" from this
};

export type SerializedMessage = {
  id: number;
  body: string;
  channelId: string;
  createdAt: string;
  user: SerializedUser;
  reactions: ReactionSummary[];
};

export type SerializedChannel = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isDm: boolean;
  partner?: SerializedUser | null; // the other participant, for DM channels
};

// Events pushed from the server to clients over the SSE stream.
// `audience` scopes a private event (a DM) to specific user ids; when present,
// the stream only forwards it to connections whose user is in the list. Public
// (channel) events omit it and reach everyone.
export type BusEvent =
  | {
      type: "message";
      channelId: string;
      message: SerializedMessage;
      nonce?: string;
      audience?: string[];
    }
  | { type: "message-delete"; channelId: string; messageId: number; audience?: string[] }
  | {
      type: "reaction";
      channelId: string;
      messageId: number;
      reactions: ReactionSummary[];
      audience?: string[];
    }
  | { type: "typing"; channelId: string; user: SerializedUser; audience?: string[] }
  | { type: "channel"; channel: SerializedChannel }
  | { type: "presence"; online: SerializedUser[] };
