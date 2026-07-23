# Commons

**A focused, real-time team chat for the Cursor Boston cohort.**
Channels, presence, and message history — with the noise turned off.

Commons is a self-contained, production-grade-architecture chat app: clone it,
run two commands, and you have a working real-time chat backed by a real
database. No accounts, no API keys, no external services required to run it.

> Built for **Cursor Boston · Week 2**. See [`docs/PRD.md`](docs/PRD.md) for the
> full product spec and [`BACKLOG.md`](BACKLOG.md) for the prioritized roadmap.

---

## Features

- 🔐 **Credential auth** — email + password (bcrypt), DB-backed sessions in an
  `httpOnly` cookie. Real signup / login / logout.
- 💬 **Channels** — create topic channels (auto-slugified, unique), `#general`
  seeded by default.
- ⚡ **Real-time messaging** — messages appear for everyone in the channel in
  under a second via Server-Sent Events. Optimistic send with retry-on-failure.
- 🟢 **Presence & typing** — see who's online (ref-counted across tabs) and
  "X is typing…" indicators, all live.
- 😀 **Reactions** — toggle emoji reactions; counts update live for everyone.
- 🛡️ **Moderation & roles** — the first member becomes admin; authors delete
  their own messages, admins delete any (soft delete, removed live).
- ✉️ **Direct messages** — private 1:1 conversations (membership-enforced,
  audience-scoped so only the two participants receive them). Start one by
  clicking someone in the online list.
- 🔎 **Search** — find past messages by content, jump to the channel.
- 🎟️ **Invite gating (optional)** — set `COMMONS_INVITE_CODE` to require a code
  at signup.
- 🕓 **Persistent, paginated history** — messages persist and older ones load as
  you scroll up.
- 🔁 **Reconnect + backfill** — if the stream drops, the client reconnects and
  replays anything it missed (via `Last-Event-ID`).
- 🚦 **Abuse guards** — server-side Zod validation, message length caps, and a
  per-user rate limit.
- 🎨 **Polished, responsive UI** — light/dark aware, keyboard-friendly,
  mobile drawer sidebar, unread badges, empty/loading/error states.

---

## Quickstart

Requires **Node 20+**.

```bash
git clone https://github.com/CodingWCal/commons.git
cd commons
npm install                 # installs deps + generates the Prisma client
cp .env.example .env        # local SQLite + a dev session secret
npm run db:push             # create the SQLite database
npm run db:seed             # seed #general, #week-2, #help, #showcase
npm run dev                 # http://localhost:3000
```

Open two browser windows, sign up as two people, and watch messages fly between
them in real time.

> On Windows PowerShell, use `copy .env.example .env` instead of `cp`.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Node test runner + tsx) |
| `npm run test:e2e` | Playwright E2E + API tests (isolated test DB) |
| `npm run db:push` | Sync the Prisma schema to the database |
| `npm run db:seed` | Seed default channels (idempotent) |
| `npm run db:reset` | Wipe + recreate + reseed the database |
| `npm run db:studio` | Open Prisma Studio to inspect data |

---

## Architecture

```
Browser ──HTTP──▶ Next.js Route Handlers ──▶ Prisma ──▶ SQLite (dev) / Postgres (prod)
   ▲                      │
   └──── SSE stream ◀──────┘  in-process event bus (publish/subscribe)
```

- **Framework:** Next.js 16 (App Router) + TypeScript (strict) + Tailwind CSS v4.
- **Data:** Prisma ORM. SQLite locally for zero-setup; the schema is
  Postgres-ready (see below). Models: `User`, `Session`, `Channel`, `Message`.
- **Auth:** `lib/auth.ts` — bcrypt password hashing, opaque session tokens stored
  HMAC-hashed in the DB, delivered as an `httpOnly` / `SameSite=Lax` cookie.
  `src/proxy.ts` bounces unauthenticated visitors to `/login`.
- **Realtime:** `GET /api/stream` opens a Server-Sent Events connection.
  A message POST persists the row, then publishes to an in-process event bus
  (`lib/bus.ts`), which fans out to every subscribed stream. Presence
  (`lib/presence.ts`) rides the same bus.
- **Client store:** `components/AppShell.tsx` holds channels, messages, presence,
  and the single `EventSource`. Sends are optimistic and reconciled by a `nonce`
  (or de-duped by id).

### Project structure

```
src/
  app/
    api/
      auth/{signup,login,logout}/route.ts
      channels/route.ts                    # list + create
      channels/[slug]/messages/route.ts    # history + send
      stream/route.ts                      # SSE
    login/, signup/, page.tsx, layout.tsx, globals.css
  components/    AppShell, Sidebar, MessageList, Composer, NewChannelDialog, ...
  lib/          prisma, auth, bus, presence, validations, rate-guard, slug, avatar
  proxy.ts      auth redirect gate
prisma/         schema.prisma, seed.ts
tests/          slug, validations, avatar
docs/PRD.md     product requirements
```

---

## From prototype to production

This build is deliberately honest about what's a prototype shortcut vs.
production architecture. Two things change on the way to multi-instance prod:

1. **Database → Postgres.** In `prisma/schema.prisma` set
   `provider = "postgresql"`, point `DATABASE_URL` at Postgres (e.g. Supabase /
   Neon / Vercel Postgres), and run `npx prisma migrate deploy`. **No
   application code changes** — Prisma abstracts it.
2. **Realtime bus → durable pub/sub.** The in-process event bus
   (`lib/bus.ts`) works on a single node (local dev, or a single-instance host
   like Render / Railway / Fly). For serverless / multi-instance (e.g. Vercel),
   swap it for Postgres `LISTEN/NOTIFY` or Redis pub/sub behind the same
   `publish()` / `subscribe()` surface. The rate guard (`lib/rate-guard.ts`)
   similarly moves to Redis.

Other production hardening (tracked in [`BACKLOG.md`](BACKLOG.md)): CSRF tokens,
distributed rate limiting, moderation/roles, audit logging, observability,
backups, and Playwright E2E in CI.

---

## Security notes

- Passwords are only ever stored bcrypt-hashed; login uses a generic error and a
  timing-equalizer to resist account enumeration.
- Message bodies are rendered as text (React escaping) — no `dangerouslySetInnerHTML`.
- All mutating endpoints validate input with Zod and derive the user from the
  session, never from client input.
- `SESSION_SECRET` and the database live in `.env` (git-ignored). Set a strong
  `SESSION_SECRET` in production (it's required there).
- `npm audit` currently reports a few transitive advisories from the toolchain;
  these are tracked in the backlog rather than force-fixed.

---

## Tests

```bash
npm test        # unit tests (pure logic)
npm run test:e2e   # Playwright end-to-end + API tests
```

- **Unit** (`tests/`) — slugify, Zod schemas, avatar helpers (Node test runner + tsx).
- **End-to-end** (`e2e/`) — Playwright drives two independent browser contexts
  (two real users) to prove cross-user real-time delivery, channel broadcast, and
  persistence across reload. `test:e2e` first provisions an isolated test
  database (`scripts/setup-e2e-db.mjs`) so it never touches dev data.
- **API** (`e2e/api.spec.ts`) — request-context tests for the auth gate (401),
  CSRF/same-origin guard (403), input validation (400), unknown channel (404),
  duplicate slug (409), per-user rate limit (429), and sign-out-of-all-devices.

---

## License

MIT — see [`LICENSE`](LICENSE).
