import type {
  SerializedChannel,
  SerializedMessage,
  SerializedUser,
} from "@/lib/types";

export type CurrentUser = {
  id: string;
  displayName: string;
  email: string;
  avatarColor: string;
};

// A message in the client store. Confirmed messages have a real numeric id;
// optimistic ones carry a `nonce` and a `pending`/`failed` flag until the
// server (via POST response or SSE echo) reconciles them.
export type ChatMessage = SerializedMessage & {
  pending?: boolean;
  failed?: boolean;
  nonce?: string;
};

export type { SerializedChannel, SerializedMessage, SerializedUser };
