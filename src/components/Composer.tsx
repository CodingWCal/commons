"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  disabled: boolean;
  channelName: string;
  error: string | null;
  onClearError: () => void;
  onSend: (body: string) => void;
  onTyping: () => void;
};

const MAX = 4000;
const MAX_HEIGHT = 160;

export default function Composer({
  disabled,
  channelName,
  error,
  onClearError,
  onSend,
  onTyping,
}: Props) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the textarea up to a max height.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  function submit() {
    const body = value.trim();
    if (!body || disabled) return;
    onSend(body);
    setValue("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const remaining = MAX - value.length;

  return (
    <div className="shrink-0 border-t border-rule bg-paper-2 px-4 py-3">
      <div className="mx-auto max-w-3xl">
        {error && (
          <div
            role="alert"
            className="mb-2 flex items-center justify-between rounded-md bg-brick-soft px-3 py-1.5 text-sm text-brick"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={onClearError}
              className="ml-3 text-brick/70 hover:text-brick"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}
        <div className="flex items-end gap-2 rounded-lg border border-rule-2 bg-paper px-3 py-2 focus-within:border-commons">
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            disabled={disabled}
            maxLength={MAX}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) onClearError();
              if (e.target.value.trim()) onTyping();
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              disabled
                ? "Select a channel to start chatting"
                : `Message #${channelName}`
            }
            aria-label={`Message #${channelName}`}
            className="scroll-thin max-h-40 min-h-[24px] flex-1 resize-none bg-transparent text-sm text-ink placeholder:text-ink-3 focus:outline-none disabled:cursor-not-allowed"
          />
          <button
            type="button"
            onClick={submit}
            disabled={disabled || value.trim().length === 0}
            className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-commons text-white transition-colors hover:bg-commons-strong disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send message"
          >
            <SendIcon />
          </button>
        </div>
        <div className="mt-1 flex justify-between px-1 text-[11px] text-ink-3">
          <span>
            <kbd className="font-sans">Enter</kbd> to send ·{" "}
            <kbd className="font-sans">Shift+Enter</kbd> for a new line
          </span>
          {remaining < 200 && (
            <span className={remaining < 0 ? "text-danger" : ""}>{remaining}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 12l16-8-6 8 6 8-16-8z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
