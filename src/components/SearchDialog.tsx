"use client";

import { useEffect, useRef, useState } from "react";
import Avatar from "./Avatar";
import { useDialogFocus } from "./useDialogFocus";

type Result = {
  id: number;
  body: string;
  createdAt: string;
  user: { id: string; displayName: string; avatarColor: string };
  channel: { slug: string; name: string };
};

type Props = {
  onJump: (slug: string) => void;
  onClose: () => void;
};

export default function SearchDialog({ onJump, onClose }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  useDialogFocus(cardRef);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const term = q.trim();
    const timer = setTimeout(async () => {
      if (term.length < 2) {
        setResults([]);
        setSearched(false);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        const data = (await res.json()) as { results?: Result[] };
        setResults(data.results ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
        setSearched(true);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-4 pt-24"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Search messages"
    >
      <div
        ref={cardRef}
        className="w-full max-w-lg overflow-hidden rounded-xl border border-rule bg-paper-2 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-rule p-3">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search messages…"
            className="w-full bg-transparent px-1 text-ink placeholder:text-ink-3 focus:outline-none"
          />
        </div>

        <div className="scroll-thin max-h-96 overflow-y-auto">
          {loading && <p className="p-4 text-sm text-ink-3">Searching…</p>}
          {!loading && searched && results.length === 0 && (
            <p className="p-4 text-sm text-ink-3">No messages found.</p>
          )}
          {!loading &&
            results.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  onJump(r.channel.slug);
                  onClose();
                }}
                className="flex w-full items-start gap-3 border-b border-rule px-4 py-3 text-left last:border-0 hover:bg-paper-3"
              >
                <Avatar name={r.user.displayName} color={r.user.avatarColor} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 text-xs text-ink-3">
                    <span className="font-medium text-ink-2">
                      {r.user.displayName}
                    </span>
                    <span>in #{r.channel.name}</span>
                    <span>
                      {new Date(r.createdAt).toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  <p className="message-body truncate text-sm text-ink">{r.body}</p>
                </div>
              </button>
            ))}
          {!searched && !loading && (
            <p className="p-4 text-sm text-ink-3">Type at least 2 characters to search.</p>
          )}
        </div>
      </div>
    </div>
  );
}
