"use client";

import { useLayoutEffect, useRef } from "react";
import Avatar from "./Avatar";
import type { ChatMessage } from "./chat-types";

type Props = {
  messages: ChatMessage[];
  currentUserId: string;
  channelName: string;
  onRetry: (message: ChatMessage) => void;
};

const GROUP_GAP_MS = 5 * 60 * 1000;

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

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
  channelName,
  onRetry,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wantBottom = useRef(true);

  useLayoutEffect(() => {
    wantBottom.current = true;
  }, [channelName]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (wantBottom.current) {
      el.scrollTop = el.scrollHeight;
      if (messages.length > 0) wantBottom.current = false;
    } else if (nearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, channelName]);

  if (messages.length === 0) {
    return (
      <div
        ref={containerRef}
        className="scroll-thin flex flex-1 items-center justify-center overflow-y-auto p-6"
      >
        <div className="text-center">
          <p className="text-lg font-medium text-ink">
            {channelName ? `Welcome to #${channelName}` : "No channel selected"}
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
      className="scroll-thin flex-1 overflow-y-auto px-4 py-4"
      aria-live="polite"
      aria-label={`Messages in ${channelName}`}
    >
      <div className="mx-auto max-w-3xl space-y-0.5">
        {messages.map((message, i) => {
          const prev = messages[i - 1];
          const showDay =
            !prev ||
            new Date(prev.createdAt).toDateString() !==
              new Date(message.createdAt).toDateString();
          const grouped =
            !showDay &&
            prev &&
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

              <div
                className={`group flex gap-3 rounded-md px-2 ${
                  grouped ? "py-0.5" : "mt-2 py-0.5"
                } hover:bg-paper-2`}
              >
                <div className="w-9 shrink-0">
                  {!grouped ? (
                    <Avatar
                      name={message.user.displayName}
                      color={message.user.avatarColor}
                      size={36}
                    />
                  ) : (
                    <span className="mt-1 block text-right text-[10px] leading-5 text-transparent group-hover:text-ink-3">
                      {timeLabel(message.createdAt)}
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  {!grouped && (
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold text-ink">
                        {message.user.displayName}
                        {message.user.id === currentUserId && (
                          <span className="ml-1 font-normal text-ink-3">(you)</span>
                        )}
                      </span>
                      <span className="text-xs text-ink-3">
                        {timeLabel(message.createdAt)}
                      </span>
                    </div>
                  )}
                  <p
                    className={`message-body animate-message-in text-sm leading-relaxed ${
                      message.failed ? "text-danger" : "text-ink"
                    } ${message.pending ? "opacity-60" : ""}`}
                  >
                    {message.body}
                  </p>
                  {message.pending && (
                    <span className="text-xs text-ink-3">Sending…</span>
                  )}
                  {message.failed && (
                    <span className="text-xs text-danger">
                      Failed to send.{" "}
                      <button
                        type="button"
                        onClick={() => onRetry(message)}
                        className="font-medium underline hover:no-underline"
                      >
                        Retry
                      </button>
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
