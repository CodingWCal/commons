"use client";

import { useState } from "react";
import Avatar from "./Avatar";
import { REACTION_EMOJI } from "@/lib/reactions";
import type { ChatMessage } from "./chat-types";

type Props = {
  message: ChatMessage;
  currentUserId: string;
  isAdmin: boolean;
  grouped: boolean;
  onReact: (emoji: string) => void;
  onDelete: () => void;
  onRetry: () => void;
};

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function MessageItem({
  message,
  currentUserId,
  isAdmin,
  grouped,
  onReact,
  onDelete,
  onRetry,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const canDelete =
    !message.pending &&
    !message.failed &&
    (message.user.id === currentUserId || isAdmin);

  return (
    <div
      className={`group relative flex gap-3 rounded-md px-2 ${
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
            <span className="text-xs text-ink-3">{timeLabel(message.createdAt)}</span>
          </div>
        )}

        <p
          className={`message-body animate-message-in text-sm leading-relaxed ${
            message.failed ? "text-danger" : "text-ink"
          } ${message.pending ? "opacity-60" : ""}`}
        >
          {message.body}
        </p>

        {message.pending && <span className="text-xs text-ink-3">Sending…</span>}
        {message.failed && (
          <span className="text-xs text-danger">
            Failed to send.{" "}
            <button
              type="button"
              onClick={onRetry}
              className="font-medium underline hover:no-underline"
            >
              Retry
            </button>
          </span>
        )}

        {/* Reactions */}
        {message.reactions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {message.reactions.map((r) => {
              const mine = r.userIds.includes(currentUserId);
              return (
                <button
                  key={r.emoji}
                  type="button"
                  onClick={() => onReact(r.emoji)}
                  className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors ${
                    mine
                      ? "border-commons bg-commons-soft text-commons-strong"
                      : "border-rule bg-paper-2 text-ink-2 hover:border-rule-2"
                  }`}
                  aria-pressed={mine}
                  aria-label={`${r.emoji} ${r.count}`}
                >
                  <span>{r.emoji}</span>
                  <span className="tabular-nums">{r.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Hover actions */}
      {!message.pending && !message.failed && (
        <div className="absolute right-2 top-0 hidden -translate-y-1/2 items-center gap-0.5 rounded-md border border-rule bg-paper-2 p-0.5 shadow-sm group-hover:flex">
          <div className="relative">
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              className="rounded p-1 text-ink-3 hover:bg-paper-3 hover:text-ink"
              aria-label="Add reaction"
              title="Add reaction"
            >
              <SmileIcon />
            </button>
            {pickerOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setPickerOpen(false)}
                  aria-hidden
                />
                <div className="absolute right-0 z-50 mt-1 flex gap-0.5 rounded-md border border-rule bg-paper-2 p-1 shadow-lg">
                  {REACTION_EMOJI.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        setPickerOpen(false);
                        onReact(emoji);
                      }}
                      className="rounded p-1 text-base hover:bg-paper-3"
                      aria-label={`React with ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded p-1 text-ink-3 hover:bg-brick-soft hover:text-brick"
              aria-label="Delete message"
              title="Delete message"
            >
              <TrashIcon />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SmileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M8.5 14.5a4.5 4.5 0 007 0M9 9.5h.01M15 9.5h.01"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0v12a1 1 0 001 1h6a1 1 0 001-1V7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
