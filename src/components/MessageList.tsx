"use client";

import { useLayoutEffect, useRef } from "react";
import MessageItem from "./MessageItem";
import type { ChatMessage } from "./chat-types";

type Props = {
  messages: ChatMessage[];
  currentUserId: string;
  isAdmin: boolean;
  channelName: string;
  isDm: boolean;
  hasMore: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  onReact: (message: ChatMessage, emoji: string) => void;
  onDelete: (message: ChatMessage) => void;
  onEdit: (message: ChatMessage, body: string) => Promise<boolean>;
  onRetry: (message: ChatMessage) => void;
};

const GROUP_GAP_MS = 5 * 60 * 1000;
const LOAD_OLDER_THRESHOLD_PX = 80;

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

export default function MessageList({
  messages,
  currentUserId,
  isAdmin,
  channelName,
  isDm,
  hasMore,
  loadingOlder,
  onLoadOlder,
  onReact,
  onDelete,
  onEdit,
  onRetry,
}: Props) {
  const label = isDm ? channelName : `#${channelName}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const wantBottom = useRef(true);
  const prevFirstId = useRef<number | null>(null);
  // When loading older messages, remember the scroll metrics so we can keep the
  // viewport anchored after the prepend.
  const pendingOlder = useRef<{ height: number; top: number } | null>(null);

  useLayoutEffect(() => {
    wantBottom.current = true;
    prevFirstId.current = null;
  }, [channelName]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const firstId = messages.find((m) => m.id > 0)?.id ?? null;
    const prepended =
      pendingOlder.current !== null &&
      firstId !== null &&
      prevFirstId.current !== null &&
      firstId < prevFirstId.current;

    if (prepended && pendingOlder.current) {
      // Restore position so the content the user was reading stays put.
      el.scrollTop = el.scrollHeight - pendingOlder.current.height + pendingOlder.current.top;
      pendingOlder.current = null;
    } else {
      pendingOlder.current = null;
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
      if (wantBottom.current) {
        el.scrollTop = el.scrollHeight;
        if (messages.length > 0) wantBottom.current = false;
      } else if (nearBottom) {
        el.scrollTop = el.scrollHeight;
      }
    }
    prevFirstId.current = firstId;
  }, [messages, channelName]);

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    if (
      el.scrollTop < LOAD_OLDER_THRESHOLD_PX &&
      hasMore &&
      !loadingOlder &&
      !pendingOlder.current
    ) {
      pendingOlder.current = { height: el.scrollHeight, top: el.scrollTop };
      onLoadOlder();
    }
  }

  if (messages.length === 0) {
    return (
      <div className="scroll-thin flex flex-1 items-center justify-center overflow-y-auto p-6">
        <div className="text-center">
          <p className="font-display text-2xl text-ink">
            {!channelName
              ? "No channel selected"
              : isDm
                ? `This is the start of your conversation with ${channelName}`
                : `Welcome to #${channelName}`}
          </p>
          <p className="mt-1 text-sm text-ink-2">
            {channelName
              ? "No messages yet — say hi 👋"
              : "Pick a channel to start chatting."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="scroll-thin flex-1 overflow-y-auto px-4 py-4"
      aria-live="polite"
      aria-label={`Messages in ${label}`}
    >
      <div className="mx-auto max-w-3xl">
        {loadingOlder && (
          <p className="py-2 text-center text-xs text-ink-3">Loading older messages…</p>
        )}
        {!hasMore && (
          <p className="py-2 text-center text-xs text-ink-3">
            {isDm
              ? `This is the beginning of your conversation with ${channelName}.`
              : `This is the beginning of #${channelName}.`}
          </p>
        )}

        <div className="space-y-0.5">
          {messages.map((message, i) => {
            const prev = messages[i - 1];
            const showDay =
              !prev ||
              new Date(prev.createdAt).toDateString() !==
                new Date(message.createdAt).toDateString();
            const grouped =
              !showDay &&
              !!prev &&
              prev.user.id === message.user.id &&
              new Date(message.createdAt).getTime() -
                new Date(prev.createdAt).getTime() <
                GROUP_GAP_MS;

            return (
              <div key={message.nonce ?? message.id}>
                {showDay && (
                  <div className="my-4 flex items-center gap-3">
                    <div className="h-px flex-1 bg-rule" />
                    <span className="text-xs font-medium text-ink-3">
                      {dayLabel(message.createdAt)}
                    </span>
                    <div className="h-px flex-1 bg-rule" />
                  </div>
                )}
                <MessageItem
                  message={message}
                  currentUserId={currentUserId}
                  isAdmin={isAdmin}
                  grouped={grouped}
                  onReact={(emoji) => onReact(message, emoji)}
                  onDelete={() => onDelete(message)}
                  onEdit={(body) => onEdit(message, body)}
                  onRetry={() => onRetry(message)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
