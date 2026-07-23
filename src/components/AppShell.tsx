"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import MessageList from "./MessageList";
import Composer from "./Composer";
import NewChannelDialog from "./NewChannelDialog";
import type {
  ChatMessage,
  CurrentUser,
  SerializedChannel,
  SerializedMessage,
  SerializedUser,
} from "./chat-types";

type ConnectionStatus = "connecting" | "live" | "reconnecting";
type MessageMap = Record<string, ChatMessage[]>;

type Props = {
  currentUser: CurrentUser;
  channels: SerializedChannel[];
  initialActiveChannelId: string | null;
  initialMessages: SerializedMessage[];
  initialOnline: SerializedUser[];
};

// Merge an incoming message into a channel's list: reconcile an optimistic
// message by nonce, or de-dupe by id, otherwise append.
function mergeIncoming(
  map: MessageMap,
  channelId: string,
  message: SerializedMessage,
  nonce?: string,
): MessageMap {
  const list = map[channelId] ?? [];

  if (nonce) {
    const idx = list.findIndex((m) => m.nonce === nonce);
    if (idx !== -1) {
      const next = list.slice();
      next[idx] = { ...message };
      return { ...map, [channelId]: next };
    }
  }
  if (list.some((m) => m.id === message.id)) return map;
  return { ...map, [channelId]: [...list, message] };
}

// Combine freshly fetched history with whatever is already in the store
// (confirmed messages de-duped + ordered by id; optimistic temps kept last).
function mergeHistory(
  existing: ChatMessage[],
  fetched: SerializedMessage[],
): ChatMessage[] {
  const confirmed = new Map<number, ChatMessage>();
  for (const m of [...existing, ...fetched]) {
    if (m.id > 0) confirmed.set(m.id, m as ChatMessage);
  }
  const ordered = [...confirmed.values()].sort((a, b) => a.id - b.id);
  const pending = existing.filter((m) => m.id < 0);
  return [...ordered, ...pending];
}

export default function AppShell({
  currentUser,
  channels: initialChannels,
  initialActiveChannelId,
  initialMessages,
  initialOnline,
}: Props) {
  const router = useRouter();

  const [channels, setChannels] = useState<SerializedChannel[]>(initialChannels);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(
    initialActiveChannelId,
  );
  const [messagesByChannel, setMessagesByChannel] = useState<MessageMap>(() =>
    initialActiveChannelId
      ? { [initialActiveChannelId]: initialMessages }
      : {},
  );
  const [online, setOnline] = useState<SerializedUser[]>(initialOnline);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [sendError, setSendError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const loadedChannels = useRef<Set<string>>(
    new Set(initialActiveChannelId ? [initialActiveChannelId] : []),
  );
  const tempIdRef = useRef(0);
  const activeIdRef = useRef<string | null>(initialActiveChannelId);
  const channelsRef = useRef<SerializedChannel[]>(initialChannels);

  useEffect(() => {
    activeIdRef.current = activeChannelId;
  }, [activeChannelId]);

  useEffect(() => {
    channelsRef.current = channels;
  }, [channels]);

  const activeChannel = useMemo(
    () => channels.find((c) => c.id === activeChannelId) ?? null,
    [channels, activeChannelId],
  );

  // ---- Real-time stream (opened once) ------------------------------------
  useEffect(() => {
    const es = new EventSource("/api/stream");

    es.onopen = () => setStatus("live");
    es.onerror = () => setStatus("reconnecting");

    es.addEventListener("message", (e) => {
      const { channelId, message, nonce } = JSON.parse(
        (e as MessageEvent).data,
      ) as { channelId: string; message: SerializedMessage; nonce?: string };
      setMessagesByChannel((prev) => mergeIncoming(prev, channelId, message, nonce));

      const fromSomeoneElse = message.user.id !== currentUser.id;
      if (fromSomeoneElse && channelId !== activeIdRef.current) {
        setUnread((prev) => ({ ...prev, [channelId]: (prev[channelId] ?? 0) + 1 }));
      }
    });

    es.addEventListener("channel", (e) => {
      const channel = JSON.parse((e as MessageEvent).data) as SerializedChannel;
      setChannels((prev) => {
        if (prev.some((c) => c.id === channel.id)) return prev;
        const next = [...prev, channel];
        next.sort((a, b) => {
          if (a.slug === "general") return -1;
          if (b.slug === "general") return 1;
          return a.name.localeCompare(b.name);
        });
        return next;
      });
    });

    es.addEventListener("presence", (e) => {
      const { online: list } = JSON.parse((e as MessageEvent).data) as {
        online: SerializedUser[];
      };
      setOnline(list);
    });

    return () => es.close();
  }, [currentUser.id]);

  // ---- Channel switching --------------------------------------------------
  const selectChannel = useCallback(
    async (channel: SerializedChannel, pushUrl = true) => {
      setActiveChannelId(channel.id);
      setSidebarOpen(false);
      setUnread((prev) => (prev[channel.id] ? { ...prev, [channel.id]: 0 } : prev));

      if (pushUrl && typeof window !== "undefined") {
        window.history.pushState(
          { c: channel.slug },
          "",
          `${window.location.pathname}?c=${channel.slug}`,
        );
      }

      if (loadedChannels.current.has(channel.id)) return;
      loadedChannels.current.add(channel.id);
      try {
        const res = await fetch(`/api/channels/${channel.slug}/messages`);
        if (!res.ok) throw new Error("history fetch failed");
        const { messages } = (await res.json()) as { messages: SerializedMessage[] };
        setMessagesByChannel((prev) => ({
          ...prev,
          [channel.id]: mergeHistory(prev[channel.id] ?? [], messages),
        }));
      } catch {
        loadedChannels.current.delete(channel.id); // allow a retry on next open
      }
    },
    [],
  );

  // Sync active channel with the URL (?c=slug) for deep-linking + back/forward.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const current = new URLSearchParams(window.location.search).get("c");
    const active = channelsRef.current.find((c) => c.id === activeIdRef.current);
    if (!current && active) {
      window.history.replaceState(
        { c: active.slug },
        "",
        `${window.location.pathname}?c=${active.slug}`,
      );
    }

    const onPopState = () => {
      const slug = new URLSearchParams(window.location.search).get("c");
      const target =
        (slug ? channelsRef.current.find((c) => c.slug === slug) : null) ??
        channelsRef.current[0];
      if (target) void selectChannel(target, false);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [selectChannel]);

  // ---- Sending ------------------------------------------------------------
  const sendMessage = useCallback(
    async (body: string) => {
      const channel = activeChannel;
      if (!channel) return;
      setSendError(null);

      const nonce =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `n${Date.now()}-${Math.round(performance.now())}`;
      const tempId = (tempIdRef.current -= 1);

      const optimistic: ChatMessage = {
        id: tempId,
        body,
        channelId: channel.id,
        createdAt: new Date().toISOString(),
        user: {
          id: currentUser.id,
          displayName: currentUser.displayName,
          avatarColor: currentUser.avatarColor,
        },
        pending: true,
        nonce,
      };

      setMessagesByChannel((prev) => ({
        ...prev,
        [channel.id]: [...(prev[channel.id] ?? []), optimistic],
      }));

      try {
        const res = await fetch(`/api/channels/${channel.slug}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body, nonce }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? "Message failed to send");
        }
        const { message } = (await res.json()) as { message: SerializedMessage };
        setMessagesByChannel((prev) => mergeIncoming(prev, channel.id, message, nonce));
      } catch (err) {
        setMessagesByChannel((prev) => {
          const list = prev[channel.id] ?? [];
          const idx = list.findIndex((m) => m.nonce === nonce);
          if (idx === -1) return prev;
          const next = list.slice();
          next[idx] = { ...next[idx], pending: false, failed: true };
          return { ...prev, [channel.id]: next };
        });
        setSendError(err instanceof Error ? err.message : "Message failed to send");
      }
    },
    [activeChannel, currentUser],
  );

  const retryMessage = useCallback(
    (msg: ChatMessage) => {
      if (!activeChannel) return;
      setMessagesByChannel((prev) => ({
        ...prev,
        [activeChannel.id]: (prev[activeChannel.id] ?? []).filter(
          (m) => m.nonce !== msg.nonce,
        ),
      }));
      void sendMessage(msg.body);
    },
    [activeChannel, sendMessage],
  );

  const createChannel = useCallback(
    async (name: string, description: string): Promise<string | null> => {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        return data.error ?? "Could not create channel";
      }
      const { channel } = (await res.json()) as { channel: SerializedChannel };
      // Channel arrives via SSE too, but add immediately for the creator.
      setChannels((prev) =>
        prev.some((c) => c.id === channel.id) ? prev : [...prev, channel],
      );
      setDialogOpen(false);
      await selectChannel(channel);
      return null;
    },
    [selectChannel],
  );

  const logout = useCallback(
    async (scope: "current" | "all" = "current") => {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      router.push("/login");
      router.refresh();
    },
    [router],
  );

  const messages = activeChannel
    ? messagesByChannel[activeChannel.id] ?? []
    : [];
  const onlineIds = useMemo(() => new Set(online.map((u) => u.id)), [online]);

  return (
    <div className="flex h-dvh overflow-hidden bg-paper text-ink">
      <Sidebar
        currentUser={currentUser}
        channels={channels}
        activeChannelId={activeChannelId}
        online={online}
        onlineIds={onlineIds}
        unread={unread}
        status={status}
        open={sidebarOpen}
        onSelectChannel={selectChannel}
        onNewChannel={() => setDialogOpen(true)}
        onClose={() => setSidebarOpen(false)}
        onLogout={logout}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-rule bg-paper-2 px-4">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-1.5 text-ink-2 hover:bg-paper-3 lg:hidden"
            aria-label="Open channel list"
          >
            <MenuIcon />
          </button>
          {activeChannel ? (
            <div className="min-w-0">
              <h1 className="flex items-center gap-1 truncate text-base font-semibold text-ink">
                <span className="text-ink-3">#</span>
                {activeChannel.name}
              </h1>
              {activeChannel.description && (
                <p className="truncate text-xs text-ink-2">
                  {activeChannel.description}
                </p>
              )}
            </div>
          ) : (
            <h1 className="text-base font-semibold text-ink">Commons</h1>
          )}
          <div className="ml-auto flex items-center gap-1.5 text-xs text-ink-2">
            <span
              className={`h-2 w-2 rounded-full ${
                status === "live"
                  ? "bg-online"
                  : status === "reconnecting"
                    ? "bg-brick"
                    : "bg-ink-3"
              }`}
            />
            <span className="hidden sm:inline">
              {status === "live"
                ? `${online.length} online`
                : status === "reconnecting"
                  ? "Reconnecting…"
                  : "Connecting…"}
            </span>
          </div>
        </header>

        {status === "reconnecting" && (
          <div className="bg-brick-soft px-4 py-1.5 text-center text-xs text-brick">
            Connection lost — reconnecting and catching up…
          </div>
        )}

        <MessageList
          messages={messages}
          currentUserId={currentUser.id}
          channelName={activeChannel?.name ?? ""}
          onRetry={retryMessage}
        />

        <Composer
          disabled={!activeChannel}
          channelName={activeChannel?.name ?? ""}
          error={sendError}
          onClearError={() => setSendError(null)}
          onSend={sendMessage}
        />
      </main>

      {dialogOpen && (
        <NewChannelDialog
          onCreate={createChannel}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </div>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 6h16M4 12h16M4 18h16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
