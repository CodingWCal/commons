"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import MessageList from "./MessageList";
import Composer from "./Composer";
import NewChannelDialog from "./NewChannelDialog";
import SearchDialog from "./SearchDialog";
import type {
  ChatMessage,
  CurrentUser,
  SerializedChannel,
  SerializedMessage,
  SerializedUser,
} from "./chat-types";
import type { ReactionSummary } from "@/lib/types";

type ConnectionStatus = "connecting" | "live" | "reconnecting";
type MessageMap = Record<string, ChatMessage[]>;
type TypingMap = Record<string, Record<string, { user: SerializedUser; at: number }>>;

type Props = {
  currentUser: CurrentUser;
  channels: SerializedChannel[];
  dms: SerializedChannel[];
  initialActiveChannelId: string | null;
  initialMessages: SerializedMessage[];
  initialHasMore: boolean;
  initialOnline: SerializedUser[];
};

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

export default function AppShell({
  currentUser,
  channels: initialChannels,
  dms: initialDms,
  initialActiveChannelId,
  initialMessages,
  initialHasMore,
  initialOnline,
}: Props) {
  const router = useRouter();
  const isAdmin = currentUser.role === "admin";

  const [channels, setChannels] = useState<SerializedChannel[]>(initialChannels);
  const [dms, setDms] = useState<SerializedChannel[]>(initialDms);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(
    initialActiveChannelId,
  );
  const [messagesByChannel, setMessagesByChannel] = useState<MessageMap>(() =>
    initialActiveChannelId ? { [initialActiveChannelId]: initialMessages } : {},
  );
  const [hasMoreByChannel, setHasMoreByChannel] = useState<Record<string, boolean>>(
    () => (initialActiveChannelId ? { [initialActiveChannelId]: initialHasMore } : {}),
  );
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [online, setOnline] = useState<SerializedUser[]>(initialOnline);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [typing, setTyping] = useState<TypingMap>({});
  const [sendError, setSendError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const loadedChannels = useRef<Set<string>>(
    new Set(initialActiveChannelId ? [initialActiveChannelId] : []),
  );
  const tempIdRef = useRef(0);
  const activeIdRef = useRef<string | null>(initialActiveChannelId);
  // Ref tracks BOTH public channels and DMs, for slug/id lookups in the
  // stream handler, popstate, and search-jump.
  const channelsRef = useRef<SerializedChannel[]>([...initialChannels, ...initialDms]);
  const typingThrottle = useRef(0);

  useEffect(() => {
    activeIdRef.current = activeChannelId;
  }, [activeChannelId]);
  useEffect(() => {
    channelsRef.current = [...channels, ...dms];
  }, [channels, dms]);

  const activeChannel = useMemo(
    () => [...channels, ...dms].find((c) => c.id === activeChannelId) ?? null,
    [channels, dms, activeChannelId],
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
      // A message for a channel we don't know about is a DM someone just
      // started with us — load our DM list so it appears.
      if (!channelsRef.current.some((c) => c.id === channelId)) {
        fetch("/api/dms")
          .then((r) => (r.ok ? r.json() : null))
          .then((d: { dms?: SerializedChannel[] } | null) => {
            if (d?.dms) setDms(d.dms);
          })
          .catch(() => {});
      }
      if (message.user.id !== currentUser.id && channelId !== activeIdRef.current) {
        setUnread((prev) => ({ ...prev, [channelId]: (prev[channelId] ?? 0) + 1 }));
      }
    });

    es.addEventListener("message-delete", (e) => {
      const { channelId, messageId } = JSON.parse((e as MessageEvent).data) as {
        channelId: string;
        messageId: number;
      };
      setMessagesByChannel((prev) => ({
        ...prev,
        [channelId]: (prev[channelId] ?? []).filter((m) => m.id !== messageId),
      }));
    });

    es.addEventListener("reaction", (e) => {
      const { channelId, messageId, reactions } = JSON.parse(
        (e as MessageEvent).data,
      ) as { channelId: string; messageId: number; reactions: ReactionSummary[] };
      setMessagesByChannel((prev) => ({
        ...prev,
        [channelId]: (prev[channelId] ?? []).map((m) =>
          m.id === messageId ? { ...m, reactions } : m,
        ),
      }));
    });

    es.addEventListener("typing", (e) => {
      const { channelId, user } = JSON.parse((e as MessageEvent).data) as {
        channelId: string;
        user: SerializedUser;
      };
      if (user.id === currentUser.id) return;
      setTyping((prev) => ({
        ...prev,
        [channelId]: {
          ...(prev[channelId] ?? {}),
          [user.id]: { user, at: Date.now() },
        },
      }));
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

  // Expire stale typing indicators.
  useEffect(() => {
    const timer = setInterval(() => {
      setTyping((prev) => {
        const now = Date.now();
        const next: TypingMap = {};
        let changed = false;
        for (const cid of Object.keys(prev)) {
          const users: Record<string, { user: SerializedUser; at: number }> = {};
          for (const uid of Object.keys(prev[cid])) {
            if (now - prev[cid][uid].at < 4000) users[uid] = prev[cid][uid];
            else changed = true;
          }
          if (Object.keys(users).length) next[cid] = users;
        }
        return changed ? next : prev;
      });
    }, 1500);
    return () => clearInterval(timer);
  }, []);

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
        const { messages, hasMore } = (await res.json()) as {
          messages: SerializedMessage[];
          hasMore: boolean;
        };
        setMessagesByChannel((prev) => ({ ...prev, [channel.id]: messages }));
        setHasMoreByChannel((prev) => ({ ...prev, [channel.id]: hasMore }));
      } catch {
        loadedChannels.current.delete(channel.id);
      }
    },
    [],
  );

  // URL <-> active channel sync (deep-link + back/forward).
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

  const loadOlder = useCallback(async () => {
    const channel = activeChannel;
    if (!channel || loadingOlder) return;
    const list = messagesByChannel[channel.id] ?? [];
    const oldest = list.find((m) => m.id > 0)?.id;
    if (!oldest) return;

    setLoadingOlder(true);
    try {
      const res = await fetch(
        `/api/channels/${channel.slug}/messages?before=${oldest}`,
      );
      if (!res.ok) throw new Error("load older failed");
      const { messages, hasMore } = (await res.json()) as {
        messages: SerializedMessage[];
        hasMore: boolean;
      };
      setMessagesByChannel((prev) => ({
        ...prev,
        [channel.id]: [...messages, ...(prev[channel.id] ?? [])],
      }));
      setHasMoreByChannel((prev) => ({ ...prev, [channel.id]: hasMore }));
    } catch {
      // leave hasMore as-is; user can try again
    } finally {
      setLoadingOlder(false);
    }
  }, [activeChannel, loadingOlder, messagesByChannel]);

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
        reactions: [],
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

  const deleteMessage = useCallback(async (message: ChatMessage) => {
    // Optimistically remove.
    setMessagesByChannel((prev) => ({
      ...prev,
      [message.channelId]: (prev[message.channelId] ?? []).filter(
        (m) => m.id !== message.id,
      ),
    }));
    try {
      const res = await fetch(`/api/messages/${message.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
    } catch {
      // Roll back: reinsert the message in id order (confirmed asc, pending last).
      setMessagesByChannel((prev) => {
        const list = prev[message.channelId] ?? [];
        if (list.some((m) => m.id === message.id)) return prev;
        const restored = [...list, message].sort((a, b) => {
          const ap = a.id < 0;
          const bp = b.id < 0;
          if (ap && !bp) return 1;
          if (!ap && bp) return -1;
          return a.id - b.id;
        });
        return { ...prev, [message.channelId]: restored };
      });
      setSendError("Couldn't delete that message. Please try again.");
    }
  }, []);

  const toggleReaction = useCallback(
    async (message: ChatMessage, emoji: string) => {
      if (message.id < 0) return; // not yet confirmed
      try {
        const res = await fetch(`/api/messages/${message.id}/reactions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ emoji }),
        });
        if (!res.ok) return;
        const { reactions } = (await res.json()) as { reactions: ReactionSummary[] };
        setMessagesByChannel((prev) => ({
          ...prev,
          [message.channelId]: (prev[message.channelId] ?? []).map((m) =>
            m.id === message.id ? { ...m, reactions } : m,
          ),
        }));
      } catch {
        // ignore — SSE will reconcile if it went through
      }
    },
    [],
  );

  const sendTyping = useCallback(() => {
    const channel = activeChannel;
    if (!channel) return;
    const now = Date.now();
    if (now - typingThrottle.current < 2000) return;
    typingThrottle.current = now;
    fetch(`/api/channels/${channel.slug}/typing`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }).catch(() => {});
  }, [activeChannel]);

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
      setChannels((prev) =>
        prev.some((c) => c.id === channel.id) ? prev : [...prev, channel],
      );
      setDialogOpen(false);
      await selectChannel(channel);
      return null;
    },
    [selectChannel],
  );

  const jumpToChannel = useCallback(
    (slug: string) => {
      const channel = channelsRef.current.find((c) => c.slug === slug);
      if (channel) void selectChannel(channel);
    },
    [selectChannel],
  );

  const startDm = useCallback(
    async (userId: string) => {
      if (userId === currentUser.id) return;
      try {
        const res = await fetch("/api/dms", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userId }),
        });
        if (!res.ok) return;
        const { channel } = (await res.json()) as { channel: SerializedChannel };
        setDms((prev) =>
          prev.some((d) => d.id === channel.id) ? prev : [channel, ...prev],
        );
        await selectChannel(channel);
      } catch {
        // ignore
      }
    },
    [currentUser.id, selectChannel],
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

  const messages = activeChannel ? messagesByChannel[activeChannel.id] ?? [] : [];
  // `typing` never contains the current user (SSE ignores own events) and stale
  // entries are pruned by the interval above, so this is a plain projection.
  const typingUsers = activeChannel
    ? Object.values(typing[activeChannel.id] ?? {}).map((t) => t.user)
    : [];

  return (
    <div className="flex h-dvh overflow-hidden bg-paper text-ink">
      <Sidebar
        currentUser={currentUser}
        channels={channels}
        dms={dms}
        activeChannelId={activeChannelId}
        online={online}
        unread={unread}
        open={sidebarOpen}
        onSelectChannel={selectChannel}
        onStartDm={startDm}
        onNewChannel={() => setDialogOpen(true)}
        onOpenSearch={() => setSearchOpen(true)}
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
                {!activeChannel.isDm && <span className="text-ink-3">#</span>}
                {activeChannel.name}
              </h1>
              {activeChannel.isDm ? (
                <p className="truncate text-xs text-ink-2">Direct message</p>
              ) : (
                activeChannel.description && (
                  <p className="truncate text-xs text-ink-2">
                    {activeChannel.description}
                  </p>
                )
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
          isAdmin={isAdmin && !activeChannel?.isDm}
          channelName={activeChannel?.name ?? ""}
          isDm={activeChannel?.isDm ?? false}
          hasMore={activeChannel ? (hasMoreByChannel[activeChannel.id] ?? false) : false}
          loadingOlder={loadingOlder}
          onLoadOlder={loadOlder}
          onReact={toggleReaction}
          onDelete={deleteMessage}
          onRetry={retryMessage}
        />

        <TypingIndicator users={typingUsers} />

        <Composer
          disabled={!activeChannel}
          channelName={activeChannel?.name ?? ""}
          isDm={activeChannel?.isDm ?? false}
          error={sendError}
          onClearError={() => setSendError(null)}
          onSend={sendMessage}
          onTyping={sendTyping}
        />
      </main>

      {dialogOpen && (
        <NewChannelDialog
          onCreate={createChannel}
          onClose={() => setDialogOpen(false)}
        />
      )}
      {searchOpen && (
        <SearchDialog onJump={jumpToChannel} onClose={() => setSearchOpen(false)} />
      )}
    </div>
  );
}

function TypingIndicator({ users }: { users: SerializedUser[] }) {
  let text = "";
  if (users.length === 1) text = `${users[0].displayName} is typing…`;
  else if (users.length === 2)
    text = `${users[0].displayName} and ${users[1].displayName} are typing…`;
  else if (users.length > 2) text = "Several people are typing…";

  return (
    <div className="h-5 shrink-0 px-4 text-xs italic text-ink-3" aria-live="polite">
      {text}
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
