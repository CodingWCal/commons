"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Logo from "./Logo";

type Mode = "login" | "signup";

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const isSignup = mode === "signup";

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          isSignup
            ? {
                displayName,
                email,
                password,
                ...(inviteCode.trim() ? { inviteCode: inviteCode.trim() } : {}),
              }
            : { email, password },
        ),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Something went wrong. Please try again.");
        setPending(false);
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setPending(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between bg-brand p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <Logo size={40} />
          <span className="font-display text-2xl">Commons</span>
        </div>
        <div className="max-w-md">
          <p className="font-display text-4xl leading-[1.1]">
            One calm room for the cohort.
          </p>
          <p className="mt-5 text-white/80">
            Channels, presence, and history — real-time, focused, and free of the
            noise. Built for Cursor Boston.
          </p>
        </div>
        <p className="text-sm text-white/60">Cursor Boston · Week 2</p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-paper px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Logo size={36} />
            <span className="font-display text-xl text-ink">Commons</span>
          </div>

          <h1 className="font-display text-3xl text-ink">
            {isSignup ? "Join the Commons" : "Welcome back"}
          </h1>
          <p className="mt-1 text-sm text-ink-2">
            {isSignup
              ? "Create your account to start chatting with the cohort."
              : "Sign in to pick up where the conversation left off."}
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
            {isSignup && (
              <Field
                label="Display name"
                id="displayName"
                value={displayName}
                onChange={setDisplayName}
                autoComplete="name"
                placeholder="Ada Lovelace"
                required
              />
            )}
            <Field
              label="Email"
              id="email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              placeholder="you@example.com"
              required
            />
            <Field
              label="Password"
              id="password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete={isSignup ? "new-password" : "current-password"}
              placeholder={isSignup ? "At least 8 characters" : "Your password"}
              required
            />
            {isSignup && (
              <Field
                label="Invite code"
                id="inviteCode"
                value={inviteCode}
                onChange={setInviteCode}
                placeholder="If your workspace requires one"
              />
            )}

            {error && (
              <p
                role="alert"
                className="rounded-md bg-brick-soft px-3 py-2 text-sm text-brick"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="flex w-full items-center justify-center rounded-md bg-commons px-4 py-2.5 font-medium text-on-commons transition-colors hover:bg-commons-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-commons disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending
                ? "Just a moment…"
                : isSignup
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-sm text-ink-2">
            {isSignup ? "Already have an account? " : "New to Commons? "}
            <Link
              href={isSignup ? "/login" : "/signup"}
              className="font-medium text-commons hover:underline"
            >
              {isSignup ? "Sign in" : "Create one"}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  id,
  value,
  onChange,
  type = "text",
  autoComplete,
  placeholder,
  required,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-md border border-rule-2 bg-paper-2 px-3 py-2 text-ink placeholder:text-ink-3 focus-visible:border-commons focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-commons"
      />
    </div>
  );
}
