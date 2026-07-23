<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Commons — project context

Commons is a real-time cohort chat (see `docs/PRD.md`). Self-contained: runs with
`npm install && npm run dev`, no external services.

## Stack
- Next.js 16 App Router, TypeScript strict, Tailwind CSS v4.
- Prisma ORM. **SQLite** in dev (`file:./dev.db`); Postgres-ready for prod (change
  `provider` + `DATABASE_URL`, run `prisma migrate deploy` — no app code changes).
- Auth: credential (bcrypt) + DB-backed session in an httpOnly cookie (`lib/auth.ts`).
- Realtime: Server-Sent Events (`app/api/stream/route.ts`) fed by an in-process
  event bus (`lib/bus.ts`); presence in `lib/presence.ts`.

## Conventions
- API logic lives in route handlers under `src/app/api/**`. All mutating routes
  validate with Zod (`lib/validations.ts`) and derive the user from the session —
  never trust a client-supplied user id.
- The Next 16 auth gate is `src/proxy.ts` (NOT `middleware.ts` — that convention
  is deprecated in this version).
- Colors/spacing come from CSS custom properties + Tailwind tokens defined in
  `src/app/globals.css`. Dynamic per-element values (e.g. avatar color) may be
  passed as inline `style`.
- Client chat state is centralized in `components/AppShell.tsx`; keep the single
  `EventSource` there. Optimistic sends reconcile by `nonce`.
- Message ids are auto-increment ints (used for SSE `Last-Event-ID` backfill and
  ordering). Do not switch them to non-ordered ids without updating the stream.

## Prototype vs production (don't blur these)
- In-process bus + in-memory rate guard are single-node ONLY. Multi-instance prod
  needs Postgres LISTEN/NOTIFY or Redis pub/sub behind the same `publish/subscribe`
  surface. Tracked in `BACKLOG.md`.

## Commands
`npm run dev` · `npm run build` · `npm run lint` · `npm test` ·
`npm run db:push` · `npm run db:seed` · `npm run db:reset` · `npm run db:studio`
