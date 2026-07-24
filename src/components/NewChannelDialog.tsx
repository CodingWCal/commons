"use client";

import { useEffect, useRef, useState } from "react";
import { slugify } from "@/lib/slug";
import { useDialogFocus } from "./useDialogFocus";

type Props = {
  // Returns an error message on failure, or null on success.
  onCreate: (name: string, description: string) => Promise<string | null>;
  onClose: () => void;
};

export default function NewChannelDialog({ onCreate, onClose }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  useDialogFocus(cardRef);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || pending) return;
    setPending(true);
    setError(null);
    const err = await onCreate(name.trim(), description.trim());
    if (err) {
      setError(err);
      setPending(false);
    }
    // On success the parent closes the dialog.
  }

  const slug = slugify(name);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Create a channel"
    >
      <div
        ref={cardRef}
        className="w-full max-w-md rounded-xl border border-rule bg-paper-2 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-ink">Create a channel</h2>
        <p className="mt-1 text-sm text-ink-2">
          Channels keep conversations focused by topic.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="channel-name"
              className="mb-1.5 block text-sm font-medium text-ink"
            >
              Name
            </label>
            <input
              id="channel-name"
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder="e.g. Office Hours"
              className="w-full rounded-md border border-rule-2 bg-paper px-3 py-2 text-ink placeholder:text-ink-3 focus-visible:border-commons focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-commons"
            />
            {slug && (
              <p className="mt-1 text-xs text-ink-3">
                Will be created as{" "}
                <span className="font-medium text-ink-2">#{slug}</span>
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="channel-description"
              className="mb-1.5 block text-sm font-medium text-ink"
            >
              Description{" "}
              <span className="font-normal text-ink-3">(optional)</span>
            </label>
            <input
              id="channel-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              placeholder="What's this channel about?"
              className="w-full rounded-md border border-rule-2 bg-paper px-3 py-2 text-ink placeholder:text-ink-3 focus-visible:border-commons focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-commons"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-md bg-brick-soft px-3 py-2 text-sm text-brick">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-ink-2 hover:bg-paper-3"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending || !name.trim()}
              className="rounded-md bg-commons px-4 py-2 text-sm font-medium text-on-commons transition-colors hover:bg-commons-strong disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Creating…" : "Create channel"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
