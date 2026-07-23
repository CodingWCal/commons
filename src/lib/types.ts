// Shared, transport-safe shapes. Everything sent to the client or over SSE
// uses these (dates as ISO strings, no Prisma internals).

export type SerializedUser = {
  id: string;
  displayName: string;
  avatarColor: string;
};

export type SerializedMessage = {
  id: number;
  body: string;
  channelId: string;
  createdAt: string;
  user: SerializedUser;
};

export type SerializedChannel = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
};

// Events pushed from the server to clients over the SSE stream.
export type BusEvent =
  | { type: "message"; channelId: string; message: SerializedMessage; nonce?: string }
  | { type: "channel"; channel: SerializedChannel }
  | { type: "presence"; online: SerializedUser[] };
