# Ticket Backlog

Generated: 2026-07-23
Repo/app: Commons (Cursor Boston · Week 2)
Audit scope: Full source (`src/app`, `src/components`, `src/lib`, `prisma/`,
`tests/`, config), the PRD (`docs/PRD.md`), and live end-to-end verification in
the browser (signup, messaging, realtime across two connections, channel
creation, presence, validation/negative paths, rate limiting).

> **Progress (2026-07-23):** ✅ Done — TICKET-003, 004, 005, 006, 007, 010, 011,
> 013, 015, 018, 019, 020 (12 tickets). Plus a final-QA hardening pass: added
> server-side rate limits to the typing + reaction endpoints, rolled back failed
> optimistic deletes, and made first-user-admin assignment race-safe (transaction).
> Plus TICKET-009 direct messages (private 1:1, membership-enforced, audience-scoped
> SSE). All verified live and/or by the Playwright suite (build + lint + 13 unit +
> 10 e2e). **Still blocked on infra** (need a DB/Redis/object-store/Sentry): 001
> Postgres, 002 durable pub/sub, 008 distributed rate limit, 012 file uploads, 014
> observability. **Remaining unblocked:** 016 (monitor-only), 017 (risky, cosmetic).

## Product Intent Snapshot

- **Plain English:** A calm, focused real-time team chat for the Cursor Boston
  cohort — channels, live messages, presence, and history — that runs instantly
  with no external accounts.
- **Engineering framing:** Next.js 16 App Router + TS (strict) + Tailwind v4.
  Prisma ORM on SQLite (Postgres-ready). Credential auth (bcrypt + DB-backed
  session cookie). Realtime via Server-Sent Events fed by an in-process event
  bus. Route-handler API. Client state centralized in `AppShell.tsx`.
- **Brand/design guardrails:** Editorial, calm, low-noise. "Commons green"
  primary + "brick" secondary on warm paper/ink neutrals; tokens in
  `globals.css`; light/dark aware. Preserve this — do not introduce generic SaaS
  gradients or enterprise density.
- **Assumptions (inferred):** Single workspace ("Cursor Boston"), open signup,
  all channels public to the workspace (no private channels/membership yet).
  These match the PRD's Phase-0 decisions.

## Verification Summary

- **Commands run:** `npm test` → 13/13 pass · `npm run build` → success, TS
  clean · `npm run lint` → clean · `npm run db:push` + `db:seed` → ok ·
  `npm audit` → 3 transitive advisories (see TICKET-016).
- **Visual/app checks:** `/login`, `/signup`, app shell, `#general`. Verified:
  signup→session→app, send+persist across reload, **realtime SSE delivery across
  two connections**, channel create broadcast + slugify, presence, empty states,
  and API responses (409 duplicate, 400 empty/oversize, 404 missing channel,
  401 unauthenticated, 429 rate-limited).
- **Not run:** Cross-*user* realtime with two distinct sessions (the in-app
  browser shares one cookie jar — validated via two connections of one user
  instead); mobile-viewport visual pass and dark-mode visual pass (styles
  present, not screenshotted — pane not compositing); automated E2E
  (see TICKET-005).

## Priority Guide

- **P0 Critical:** security, data loss, app-breaking, or deployment-blocking.
- **P1 High:** major UX, correctness, or release-quality gap.
- **P2 Medium:** meaningful improvement, refactor, test gap, or performance.
- **P3 Low:** polish, optional enhancement, or cleanup.

---

## Tickets

### TICKET-001: Migrate the database from SQLite to Postgres for deployment

- Priority: P0
- Type: Ops
- Area: `prisma/schema.prisma`, `.env`, deploy config
- Effort: M
- Confidence: High
- Evidence: `prisma/schema.prisma` sets `provider = "sqlite"`,
  `DATABASE_URL="file:./dev.db"`. SQLite writes to the local filesystem, which is
  ephemeral/read-only on serverless hosts (Vercel) — every deploy or cold start
  loses data.
- Plain English: The app stores chat in a local file. That's perfect for running
  it on your laptop, but on most cloud hosts that file disappears, taking all
  messages and accounts with it.
- Learning brief (layman terms):
  - What is happening now: data lives in a single file next to the app.
  - Why it matters: cloud servers are disposable; the file (and all data) is lost
    on redeploy/restart.
  - What changing it means: point the app at a managed Postgres database that
    persists independently of the app server.
  - Concept to learn: *ephemeral vs. persistent storage* — why servers shouldn't
    keep the only copy of data on their own disk.
- Engineering framing: Prisma abstracts the SQL dialect, so this is a
  config-level change: switch `provider` to `postgresql`, set `DATABASE_URL` to a
  Postgres connection string (Supabase/Neon/Vercel Postgres), replace `db push`
  with a committed migration via `prisma migrate`.
- Scope:
  - Change datasource provider; add a Postgres connection string to env.
  - Generate an initial migration (`prisma migrate dev`) and commit it.
  - Update README + `.env.example`; verify seed runs against Postgres.
- Out of scope: schema redesign; the pub/sub change (TICKET-002).
- Acceptance criteria:
  - App runs against Postgres with `prisma migrate deploy` + seed.
  - Messages/accounts persist across an app restart on the target host.
  - SQLite still works locally (documented alternative) OR local also uses Postgres — pick one and document.
- Suggested files: `prisma/schema.prisma`, `.env.example`, `README.md`
- Validation: deploy to a staging host; create data; redeploy; confirm data persists.
- Delegation prompt:
  > Implement TICKET-001 using repository context and project instructions. Preserve product intent and the design system, stay within the acceptance criteria, add focused tests/migration when appropriate, and report validation results.

### TICKET-002: Replace the in-process event bus with durable pub/sub for multi-instance realtime

- Priority: P0
- Type: Ops
- Area: `src/lib/bus.ts`, `src/lib/presence.ts`, `src/app/api/stream/route.ts`
- Effort: L
- Confidence: High
- Evidence: `lib/bus.ts` uses a single Node `EventEmitter` cached on `globalThis`
  ("PROTOTYPE ONLY" comment). It only fans out within one process. On any
  multi-instance / serverless deployment, a message published on instance A never
  reaches SSE clients connected to instance B — realtime silently half-works.
- Plain English: Live updates are shared through the app's own memory, which only
  works if there's exactly one server. Add a second server and people stop seeing
  each other's messages in real time.
- Learning brief (layman terms):
  - What is happening now: the "who to notify" list lives inside one server's memory.
  - Why it matters: real deployments run multiple servers; each has its own memory, so notifications don't cross between them.
  - What changing it means: route notifications through a shared channel every server subscribes to.
  - Concept to learn: *pub/sub across processes* — a shared message broker so independent servers can broadcast to each other.
- Engineering framing: Introduce Postgres `LISTEN/NOTIFY` or Redis pub/sub behind
  the existing `publish()`/`subscribe()` surface so route handlers don't change.
  Presence must also move to a shared store with TTL heartbeats (in-memory
  ref-counts don't survive multiple instances).
- Scope:
  - Implement a shared-transport bus with the same interface.
  - Move presence to the shared store (heartbeat + expiry).
  - Keep the in-process implementation available for single-node/local via a flag.
- Out of scope: new event types; auth changes.
- Acceptance criteria:
  - With two app instances behind a load balancer, a message sent via instance A
    is delivered over SSE to a client on instance B in < 1s.
  - Presence is accurate across instances; stale connections expire.
- Suggested files: `src/lib/bus.ts`, `src/lib/presence.ts`, `src/app/api/stream/route.ts`
- Validation: run two instances locally on different ports sharing one Redis/Postgres; confirm cross-instance delivery + presence.
- Delegation prompt:
  > Implement TICKET-002 using repository context and project instructions. Keep the publish/subscribe interface stable, preserve behavior on single-node, add tests where practical, and report validation results.

### TICKET-003: Add CSRF protection to cookie-authenticated mutations

> ✅ **Done** — `assertSameOrigin()` in `src/lib/security.ts` guards every mutating route; verified by Playwright (foreign + missing Origin → 403).

- Priority: P1
- Type: Security
- Area: `src/app/api/**/route.ts`, `src/lib/auth.ts`
- Effort: M
- Confidence: Medium
- Evidence: Auth is a cookie (`commons_session`, `SameSite=Lax`). Mutating routes
  (`/api/channels`, `/api/channels/[slug]/messages`, `/api/auth/logout`) accept
  requests without an anti-CSRF token or Origin check. `SameSite=Lax` blocks most
  cross-site POSTs but is not a complete CSRF defense (e.g., top-level navigations, older clients).
- Plain English: Because login is stored in a cookie the browser sends
  automatically, a malicious page could try to make requests as a logged-in user.
  We should verify requests genuinely originate from Commons.
- Learning brief (layman terms):
  - What is happening now: the browser attaches the login cookie to any request to our domain.
  - Why it matters: another website could trick a logged-in user's browser into acting on their behalf.
  - What changing it means: require a per-session token (or verify the request's origin) so forged cross-site requests are rejected.
  - Concept to learn: *CSRF* (cross-site request forgery) and the double-submit-token / origin-check defenses.
- Engineering framing: Add an `Origin`/`Referer` allowlist check on mutating
  handlers, and/or a double-submit CSRF token issued at login and validated on POST.
- Scope: origin check helper + optional CSRF token; apply to all mutating routes.
- Out of scope: switching away from cookie auth.
- Acceptance criteria:
  - A cross-origin POST to a mutating endpoint is rejected (403).
  - Same-origin app flows continue to work unchanged.
- Suggested files: `src/lib/auth.ts` (helper), all `src/app/api/**/route.ts`
- Validation: automated test issuing a forged-origin POST → 403; app flows still pass.
- Delegation prompt:
  > Implement TICKET-003 using repository context and project instructions. Preserve existing auth UX, stay within acceptance criteria, add a focused test, and report validation results.

### TICKET-004: Harden the session lifecycle (expiry reaping, invalid-cookie cleanup, sign-out-everywhere)

> ✅ **Done** — `reapExpiredSessions()` + `requireUser()` (clears stale cookies) + `destroyAllSessions()` in `src/lib/auth.ts`; "Sign out of all devices" in the account menu; verified by Playwright.

- Priority: P1
- Type: Security
- Area: `src/lib/auth.ts`, `src/proxy.ts`
- Effort: M
- Confidence: High
- Evidence: `getCurrentUser` deletes a session only when it happens to be read
  after expiry; there is no periodic reaping of expired `Session` rows. A present
  but invalid cookie is not cleared server-side (pages just re-render `/login`).
  There is no "log out all devices."
- Plain English: Old login sessions pile up in the database and never get cleaned,
  and there's no way to revoke every session at once.
- Learning brief (layman terms):
  - What is happening now: expired sessions are only removed if someone stumbles on them.
  - Why it matters: the table grows unbounded, and a stolen-but-expired token isn't proactively purged; users can't force-logout everywhere.
  - What changing it means: periodically delete expired sessions, clear bad cookies, and add a revoke-all action.
  - Concept to learn: *session lifecycle management* and token revocation.
- Engineering framing: Add a scheduled/lazy sweep of `expiresAt < now()`, a
  response that clears the cookie when a session is invalid, and a
  `deleteMany({ userId })` sign-out-all action.
- Scope: reaping (cron or on-login sweep), cookie clearing, revoke-all endpoint + UI entry.
- Out of scope: refresh tokens / sliding expiration (note as future).
- Acceptance criteria:
  - Expired sessions are removed within a defined window.
  - An invalid session cookie is cleared on the next request.
  - "Sign out of all sessions" invalidates every session for the user.
- Suggested files: `src/lib/auth.ts`, a new maintenance route or scheduled task
- Validation: unit test for the sweep; manual revoke-all across two sessions.
- Delegation prompt:
  > Implement TICKET-004 per repository context and project instructions; add tests, preserve UX, report results.

### TICKET-005: Add Playwright end-to-end tests for the core realtime flow

> ✅ **Done** — `e2e/chat.spec.ts` runs two browser contexts (two real users): cross-user live message, channel broadcast, and persist-across-reload. `npm run test:e2e` (isolated test DB via `scripts/setup-e2e-db.mjs`).

- Priority: P1
- Type: Test
- Area: new `e2e/`, CI
- Effort: M
- Confidence: High
- Evidence: `tests/` covers only pure helpers (slug, validations, avatar). The
  realtime path, auth, and cross-session delivery were verified manually but have
  no automated regression guard.
- Plain English: The most important behavior (two people chatting live) isn't
  covered by any automated test, so a future change could break it silently.
- Learning brief (layman terms):
  - What is happening now: only small utility functions are tested automatically.
  - Why it matters: the headline feature — live messaging between users — can regress unnoticed.
  - What changing it means: a browser-driving test that signs up two users and asserts a message crosses between them.
  - Concept to learn: *end-to-end testing* with a real browser and two contexts.
- Engineering framing: Playwright with two browser contexts (separate cookie
  jars) to properly test two distinct users; assert SSE-delivered message + presence.
- Scope: signup, send/persist-on-reload, cross-user realtime, channel create broadcast; run in CI.
- Out of scope: full visual regression.
- Acceptance criteria:
  - `npm run test:e2e` spins up the app, runs the flow with two users, and passes deterministically.
  - Runs in CI on push.
- Suggested files: `e2e/chat.spec.ts`, `playwright.config.ts`, `.github/workflows/ci.yml`
- Validation: CI green; intentionally break `bus.ts` → test fails.
- Delegation prompt:
  > Implement TICKET-005 per repository context; keep tests deterministic, wire CI, report results.

### TICKET-006: Add API integration tests for the route handlers

> ✅ **Done** — implemented as Playwright request-context tests (`e2e/api.spec.ts`) hitting the running server + isolated test DB: auth gate (401), CSRF (403), validation (400), unknown channel (404), duplicate slug (409), rate limit (429), and sign-out-all. (Playwright request context was chosen over direct handler calls because the handlers depend on Next's `cookies()` runtime.)

- Priority: P1
- Type: Test
- Area: `src/app/api/**`, `tests/`
- Effort: M
- Confidence: High
- Evidence: No tests exercise the auth/channel/message handlers or the
  session/rate-guard logic against a real (test) database. Negative paths were
  checked manually (see Verification Summary) but aren't guarded.
- Plain English: The server endpoints have no automated tests, so their rules
  (auth required, validation, duplicate/rate limits) could drift.
- Learning brief (layman terms):
  - What is happening now: endpoints are only checked by hand.
  - Why it matters: rules like "reject empty messages" or "401 without a session" can silently break.
  - What changing it means: run each endpoint against a throwaway test DB and assert status codes + effects.
  - Concept to learn: *integration testing* against a real database vs. mocking.
- Engineering framing: Use a SQLite test database + a runner (Vitest or node:test)
  that calls the exported route handlers; assert 200/400/401/404/409/429 and DB rows.
- Scope: signup/login/logout, channel create (dup slug), message send (empty/oversize/missing/rate), auth session round-trip.
- Out of scope: SSE stream mechanics (covered by E2E).
- Acceptance criteria: `npm test` includes API integration tests hitting a test DB with all key cases green.
- Suggested files: `tests/api.*.test.ts`, test DB setup helper
- Validation: run suite; confirm coverage of the negative cases from the audit.
- Delegation prompt:
  > Implement TICKET-006 per repository context; isolate the test DB, cover negative paths, report results.

### TICKET-007: Moderation & roles — delete/edit own messages, admin controls

> ✅ **Done** (delete + roles) — `User.role` (first signup becomes admin), soft-delete via `DELETE /api/messages/:id` (author or admin), live removal through the `message-delete` SSE event, delete affordance in `MessageItem`. Verified live + Playwright permission test. (Message *editing* deferred.)

- Priority: P1
- Type: Feature
- Area: `prisma/schema.prisma`, message API, `MessageList.tsx`, sidebar
- Effort: L
- Confidence: Medium
- Evidence: Messages are immutable once sent (no edit/delete UI or API). There is
  no admin/facilitator role — anyone can create channels and nothing can be
  moderated. `Channel.createdById` exists but is unused for permissions.
- Plain English: There's no way to remove a mistaken or inappropriate message, and
  no facilitator role to keep the space healthy.
- Learning brief (layman terms):
  - What is happening now: every message is permanent and everyone has equal power.
  - Why it matters: real cohort use needs a way to fix mistakes and moderate.
  - What changing it means: add delete (and maybe edit) for authors, plus an admin role that can moderate + manage channels.
  - Concept to learn: *authorization / role-based access control*.
- Engineering framing: Add a `role` to `User` (member/admin) and a `deletedAt`
  (soft delete) to `Message`; enforce ownership/role server-side; broadcast a
  `message:update` event so deletes propagate live.
- Scope: soft-delete own message; admin delete-any + channel archive; live propagation; UI affordances.
- Out of scope: full audit log (TICKET-014), ban/kick.
- Acceptance criteria:
  - An author can delete their message; it disappears live for everyone.
  - A non-admin cannot delete others' messages (403); an admin can.
- Suggested files: `prisma/schema.prisma`, `src/app/api/channels/[slug]/messages/**`, `src/components/MessageList.tsx`
- Validation: integration test for permission matrix; live delete propagation.
- Delegation prompt:
  > Implement TICKET-007 per repository context; enforce authorization server-side, preserve design system, add tests, report results.

### TICKET-008: Distributed, durable rate limiting

- Priority: P2
- Type: Security
- Area: `src/lib/rate-guard.ts`
- Effort: S
- Confidence: High
- Evidence: `rate-guard.ts` keeps hit timestamps in a `globalThis` map ("PROTOTYPE
  ONLY"). Limits reset on restart and don't hold across instances.
- Plain English: The "slow down" protection lives in one server's memory, so it
  resets on restart and doesn't work across multiple servers.
- Learning brief (layman terms):
  - What is happening now: the flood-protection counter is in local memory.
  - Why it matters: restart or a second server and the limit no longer holds.
  - What changing it means: store counters in a shared store (Redis) with expiry.
  - Concept to learn: *token-bucket rate limiting* in a shared store.
- Engineering framing: Move to Redis (or Postgres) token bucket behind the same
  `allowMessage(userId)` signature. Pairs naturally with TICKET-002 infra.
- Scope: shared-store limiter with same interface; configurable limits.
- Out of scope: per-IP/global limits (note as future).
- Acceptance criteria: limit holds across restart and across two instances.
- Suggested files: `src/lib/rate-guard.ts`
- Validation: burst test across two instances → throttled consistently.
- Delegation prompt:
  > Implement TICKET-008 per repository context; keep the interface stable, report results.

### TICKET-009: Direct messages (1:1)

> ✅ **Done** — a DM is a `Channel` with `isDm=true` + a 2-row `Membership`; `/api/dms` opens/lists conversations, membership is enforced on every read/write, and SSE events carry an `audience` so private events (and reconnect backfill) reach only the two participants. Start a DM by clicking someone in the presence list; DMs are excluded from the public channel list + search. Verified by a 3-user Playwright test (delivered live to the participant, invisible to a third user).

- Priority: P2
- Type: Feature
- Area: schema, API, sidebar, message pane
- Effort: L
- Confidence: Medium
- Evidence: PRD lists DMs as a non-goal for Phase 0; only public channels exist.
- Plain English: People can't message one person privately.
- Learning brief (layman terms):
  - What is happening now: all conversation is in shared channels.
  - Why it matters: some coordination is naturally private.
  - What changing it means: a private conversation between two users, reusing the message + SSE machinery.
  - Concept to learn: *conversation modeling* (a DM is a private, 2-member channel).
- Engineering framing: Model DMs as private conversations with membership;
  restrict SSE forwarding to members; add a DM list + "message user" entry point.
- Scope: DM data model, membership-scoped delivery, UI list + start-DM.
- Out of scope: group DMs, encryption.
- Acceptance criteria: two users exchange private messages not visible to others; delivered live.
- Suggested files: `prisma/schema.prisma`, `src/app/api/**`, `src/components/**`
- Validation: E2E: A↔B DM invisible to C.
- Delegation prompt:
  > Implement TICKET-009 per repository context; scope delivery to members, preserve design, add tests, report results.

### TICKET-010: Message reactions (emoji)

> ✅ **Done** — `Reaction` model (unique per message+user+emoji), toggle via `POST /api/messages/:id/reactions`, live `reaction` SSE event, reaction pills + hover emoji picker in `MessageItem`. Verified live + Playwright toggle/invalid-emoji test.

- Priority: P2
- Type: Feature
- Area: schema, message API/SSE, `MessageList.tsx`
- Effort: M
- Confidence: Medium
- Evidence: PRD backlog item; no reaction model/UI.
- Plain English: No lightweight way to react to a message (👍, ✅) without a full reply.
- Learning brief (layman terms):
  - What is happening now: the only response is another message.
  - Why it matters: reactions cut noise and acknowledge quickly.
  - What changing it means: attach emoji reactions to messages, counted and shown live.
  - Concept to learn: *join tables* (a reaction links a user, a message, and an emoji).
- Engineering framing: `Reaction(userId, messageId, emoji)` unique triple; new SSE
  `reaction` event; aggregate counts in the client.
- Scope: add/remove reaction, live counts, hover picker.
- Out of scope: custom/uploaded emoji.
- Acceptance criteria: reacting updates counts live for all viewers; toggling works; unique per user+emoji+message.
- Suggested files: `prisma/schema.prisma`, message routes, `src/lib/types.ts`, `MessageList.tsx`
- Validation: integration test for uniqueness; live update check.
- Delegation prompt:
  > Implement TICKET-010 per repository context; extend the SSE event union, preserve design, add tests, report results.

### TICKET-011: Search over message history

> ✅ **Done** — `GET /api/search?q=` (case-insensitive `contains`, excludes deleted), debounced `SearchDialog` with results (author + channel + snippet) that jumps to the channel on click. Verified live + Playwright test. (Postgres full-text + jump-to-message deferred.)

- Priority: P2
- Type: Feature
- Area: new search API + UI
- Effort: M
- Confidence: Medium
- Evidence: No way to find past messages; history is append-only with a 50-message initial window.
- Plain English: You can't search for something someone said earlier.
- Learning brief (layman terms):
  - What is happening now: you scroll and hope.
  - Why it matters: useful info gets buried.
  - What changing it means: a search box that queries stored messages by text.
  - Concept to learn: *full-text search* (Postgres `tsvector` / SQLite FTS5).
- Engineering framing: Add a search endpoint with pagination; use Postgres FTS
  after TICKET-001 (SQLite FTS5 as an interim). Scope to channels the user can see.
- Scope: search API, results UI with jump-to-message.
- Out of scope: filters by user/date (note as future).
- Acceptance criteria: querying returns relevant messages with channel + author + timestamp; respects visibility.
- Suggested files: `src/app/api/search/route.ts`, a search UI component
- Validation: integration test on seeded data.
- Delegation prompt:
  > Implement TICKET-011 per repository context; paginate results, preserve design, add tests, report results.

### TICKET-012: File & image uploads

- Priority: P2
- Type: Feature
- Area: composer, message model, storage
- Effort: L
- Confidence: Medium
- Evidence: Composer is text-only; no attachment model or storage integration.
- Plain English: You can't share a screenshot or file.
- Learning brief (layman terms):
  - What is happening now: only text messages.
  - Why it matters: sharing screenshots/files is core to a build cohort.
  - What changing it means: upload to object storage and attach a reference to the message.
  - Concept to learn: *object storage + signed URLs* (don't store binaries in the DB).
- Engineering framing: Upload to Supabase Storage/S3 via signed URLs; store
  metadata on `Message` (or an `Attachment` table); render image previews; enforce
  size/type limits + auth.
- Scope: upload flow, attachment model, preview rendering, limits.
- Out of scope: virus scanning, video transcoding.
- Acceptance criteria: a user attaches an image; it uploads, renders inline, and persists; type/size enforced.
- Suggested files: composer, message routes, `prisma/schema.prisma`, storage lib
- Validation: upload happy-path + rejection of oversize/disallowed types.
- Delegation prompt:
  > Implement TICKET-012 per repository context; use signed uploads, enforce limits, preserve design, add tests, report results.

### TICKET-013: Deep-linkable channels (per-channel URLs + browser history)

> ✅ **Done** — active channel synced to `?c=slug` via `history.pushState` (SSE stays connected); server reads `?c=` for deep links; back/forward handled via `popstate`. Verified live + implicitly by E2E.

- Priority: P2
- Type: UX
- Area: `src/app/page.tsx`, `AppShell.tsx`, routing
- Effort: M
- Confidence: High
- Evidence: The app is a single `/` route; the active channel lives only in client
  state (`AppShell` `activeChannelId`). Reloading always lands on `#general`; you
  can't link someone to a channel, and Back/Forward don't switch channels. The
  PRD referenced `/c/[slug]` but Phase 0 shipped as an SPA.
- Plain English: You can't share a link to a specific channel, and refreshing
  always dumps you back in #general.
- Learning brief (layman terms):
  - What is happening now: the chosen channel isn't in the URL.
  - Why it matters: no shareable channel links; refresh loses your place; browser Back doesn't work as expected.
  - What changing it means: reflect the active channel in the URL and read it on load.
  - Concept to learn: *client routing and URL as state*.
- Engineering framing: Introduce `/c/[slug]` (or `?c=slug`) synced with the active
  channel; keep the single persistent `EventSource` (use a layout so it survives
  navigation, or `history.pushState` without remount).
- Scope: URL⇄active-channel sync, deep-link load, keep SSE alive across switches.
- Out of scope: server-rendering each channel's history separately (optional).
- Acceptance criteria: visiting `/c/help` opens #help; switching updates the URL; reload/Back preserve the channel; realtime stays connected.
- Suggested files: `src/app/**`, `src/components/AppShell.tsx`
- Validation: manual + E2E deep-link and Back/Forward.
- Delegation prompt:
  > Implement TICKET-013 per repository context; do not drop the persistent SSE connection, preserve design, add tests, report results.

### TICKET-014: Observability — error tracking, structured logs, SSE metrics

- Priority: P2
- Type: Ops
- Area: app-wide, `stream/route.ts`
- Effort: M
- Confidence: Medium
- Evidence: Only default Next request logging + Prisma warn/error logging. No error
  tracker, no metrics on SSE connections/heartbeats, no audit trail for auth events.
- Plain English: If something breaks in production, there's little visibility into what or why.
- Learning brief (layman terms):
  - What is happening now: minimal logging, no dashboards or alerts.
  - Why it matters: production issues are hard to detect and diagnose.
  - What changing it means: capture errors centrally and track key metrics.
  - Concept to learn: *observability* (logs, metrics, traces).
- Engineering framing: Add Sentry (or similar), structured request logging, and
  counters for active SSE connections / reconnects / message throughput; log auth
  events (login success/failure) for an audit trail.
- Scope: error tracking init, structured logs, SSE gauges, auth-event log.
- Out of scope: full tracing/APM.
- Acceptance criteria: a thrown server error appears in the tracker; active-connection count is observable; auth events are logged.
- Suggested files: instrumentation hook, `src/lib/**`, `stream/route.ts`
- Validation: trigger an error → visible in tracker; connect/disconnect → gauge moves.
- Delegation prompt:
  > Implement TICKET-014 per repository context; keep secrets in env, report results.

### TICKET-015: Paginated history / infinite scroll (load older messages)

> ✅ **Done** — `?before=<id>` cursor on the messages GET (returns `hasMore`); `MessageList` loads older on scroll-to-top and preserves scroll position; "beginning of #channel" boundary shown. Verified live (boundary + cursor).

- Priority: P2
- Type: Feature
- Area: message GET, `MessageList.tsx`
- Effort: M
- Confidence: High
- Evidence: `GET /api/channels/[slug]/messages` returns only the most recent 50
  (`HISTORY_LIMIT = 50`); there is no way to load older messages. Backfill uses
  `?after=`, but there is no "before" paging.
- Plain English: You can only ever see the last 50 messages in a channel — older history is unreachable in the UI.
- Learning brief (layman terms):
  - What is happening now: only the newest 50 messages load, with no "load more."
  - Why it matters: real conversation history becomes invisible.
  - What changing it means: fetch older messages as you scroll up.
  - Concept to learn: *cursor-based pagination*.
- Engineering framing: Add a `before=<id>` query returning the previous page;
  in `MessageList`, load older on scroll-to-top while preserving scroll position.
- Scope: `before` paging API + client infinite scroll upward.
- Out of scope: virtualization (note for very large channels).
- Acceptance criteria: scrolling to the top loads older messages in order without jumping the viewport; ends gracefully at the beginning.
- Suggested files: `src/app/api/channels/[slug]/messages/route.ts`, `src/components/MessageList.tsx`
- Validation: seed >50 messages; verify older pages load correctly.
- Delegation prompt:
  > Implement TICKET-015 per repository context; preserve scroll position, add tests, report results.

### TICKET-016: Track transitive dependency advisories (postcss / sharp via Next)

- Priority: P2
- Type: Security
- Area: dependencies
- Effort: S
- Confidence: High
- Evidence: `npm audit` → 3 advisories (1 moderate `postcss` XSS-in-stringify,
  2 high `sharp`/libvips CVEs), all pulled in transitively by `next@16.2.11`. The
  only offered fix is `npm audit fix --force` which downgrades to `next@9` — a
  non-viable breaking change.
- Plain English: The security scanner flags issues, but they're inside Next.js's
  own dependencies and the "fix" would break the app by reverting Next to an
  ancient version. The right move is to wait for a Next patch, not force it.
- Learning brief (layman terms):
  - What is happening now: the scanner reports vulnerabilities in libraries Next brings in.
  - Why it matters: they should be tracked, but blindly "fixing" would downgrade the whole framework.
  - What changing it means: monitor for a Next release that bumps these, then update Next.
  - Concept to learn: *transitive dependencies* and why you fix them at the parent (Next), not by forcing.
- Engineering framing: Pin/track via a periodic `npm audit`; upgrade `next` when a
  patched release lands; consider `overrides` only if a safe, compatible version exists.
- Scope: document current status; add a CI `npm audit` (non-blocking) note; upgrade Next when available.
- Out of scope: forcing incompatible downgrades.
- Acceptance criteria: advisories are tracked; a documented decision exists; Next upgrade path noted.
- Suggested files: `package.json`, CI config, this backlog
- Validation: re-run `npm audit` after a Next bump.
- Delegation prompt:
  > Implement TICKET-016 per repository context; do NOT force incompatible downgrades; document and monitor; report results.

### TICKET-017: Migrate Prisma seed config off the deprecated `package.json#prisma` key

- Priority: P3
- Type: DevEx
- Area: `package.json`, new `prisma.config.ts`
- Effort: S
- Confidence: High
- Evidence: Every Prisma command prints: "The configuration property
  `package.json#prisma` is deprecated and will be removed in Prisma 7." We're on
  Prisma 6.19; a 7.x upgrade is already advertised.
- Plain English: Prisma warns that the way we configure the seed script is going away in the next major version.
- Learning brief (layman terms):
  - What is happening now: seed config lives in `package.json` under a deprecated key.
  - Why it matters: it will stop working in Prisma 7.
  - What changing it means: move config to the new `prisma.config.ts` file.
  - Concept to learn: *config migration across major versions*.
- Engineering framing: Create `prisma.config.ts` with the seed command; remove the
  `prisma` block from `package.json`; verify `db:seed` still works.
- Scope: config file migration; docs note.
- Out of scope: upgrading to Prisma 7 (separate).
- Acceptance criteria: `npm run db:seed` works with no deprecation warning.
- Suggested files: `prisma.config.ts`, `package.json`
- Validation: run seed; confirm warning gone.
- Delegation prompt:
  > Implement TICKET-017 per repository context; verify seed still works, report results.

### TICKET-018: Accessibility pass — dialog focus trap, `aria-live` verification, reduced-motion

> ✅ **Done** — `useDialogFocus` hook traps Tab within the New Channel + Search dialogs and restores focus to the trigger on close; `aria-live="polite"` on the message list + typing line; reduced-motion respected for message-enter. (Full screen-reader audit still recommended.)

- Priority: P3
- Type: A11y
- Area: `NewChannelDialog.tsx`, `MessageList.tsx`, global
- Effort: M
- Confidence: Medium
- Evidence: `NewChannelDialog` is `role="dialog" aria-modal` but has no focus trap
  or focus-return on close; `MessageList` sets `aria-live="polite"` (unverified
  with a screen reader); reduced-motion is handled for message-in only.
- Plain English: Keyboard and screen-reader users may hit rough edges (focus
  escaping the dialog, new messages not announced well).
- Learning brief (layman terms):
  - What is happening now: basic ARIA is present but not fully validated.
  - Why it matters: some users navigate only by keyboard/screen reader.
  - What changing it means: trap focus in modals, return focus on close, verify announcements.
  - Concept to learn: *focus management and live regions*.
- Engineering framing: Add a focus trap + focus restore to the dialog; verify/adjust
  `aria-live` announcements; audit contrast in both themes.
- Scope: dialog focus handling, live-region verification, contrast check.
- Out of scope: full WCAG certification.
- Acceptance criteria: Tab stays within the open dialog; focus returns to the trigger on close; new messages announce once; keyboard-only flow works.
- Suggested files: `src/components/NewChannelDialog.tsx`, `src/components/MessageList.tsx`
- Validation: keyboard-only walkthrough + screen-reader spot check.
- Delegation prompt:
  > Implement TICKET-018 per repository context; preserve design, report results.

### TICKET-019: Typing indicators

> ✅ **Done** — ephemeral `typing` SSE event via `POST /api/channels/:slug/typing` (client-throttled to ~2s), "X is typing…" with auto-expire in `AppShell`. Verified live (endpoint 200 + indicator).

- Priority: P3
- Type: Feature
- Area: SSE, composer, channel header
- Effort: S
- Confidence: High
- Evidence: No "X is typing…" signal exists.
- Plain English: You can't tell when someone is about to reply.
- Learning brief (layman terms):
  - What is happening now: no typing feedback.
  - Why it matters: small cue that reduces "are they there?" friction.
  - What changing it means: broadcast ephemeral typing events over the existing bus.
  - Concept to learn: *ephemeral (non-persisted) real-time events*.
- Engineering framing: Add a throttled `typing` bus event (not persisted); show/auto-expire in the channel header.
- Scope: typing publish on input (throttled), display with timeout.
- Out of scope: typing in DMs (until TICKET-009).
- Acceptance criteria: when A types in #general, B sees "A is typing…" that clears shortly after A stops.
- Suggested files: `stream/route.ts`, `Composer.tsx`, `AppShell.tsx`, `types.ts`
- Validation: two connections; observe indicator.
- Delegation prompt:
  > Implement TICKET-019 per repository context; keep events ephemeral + throttled, report results.

### TICKET-020: Gate signup with an invite code or email allowlist

> ✅ **Done** (invite code) — `COMMONS_INVITE_CODE` env gates signup when set (open otherwise); optional invite field in `AuthForm`; documented in `.env.example`. Email-allowlist variant deferred.

- Priority: P3
- Type: Security
- Area: signup route + UI
- Effort: S
- Confidence: Medium
- Evidence: Signup is fully open (any email). PRD Open Questions flags this before
  real cohort rollout.
- Plain English: Right now anyone with the URL can create an account — fine for a
  demo, risky for a real cohort space.
- Learning brief (layman terms):
  - What is happening now: open registration.
  - Why it matters: a cohort space should be limited to the cohort.
  - What changing it means: require an invite code or restrict to allowed email domains.
  - Concept to learn: *access gating / allowlists*.
- Engineering framing: Add an invite-code check or email-domain allowlist to the
  signup handler, configured via env.
- Scope: gate signup; clear error on rejection; env-configurable.
- Out of scope: full invite-management UI.
- Acceptance criteria: signup without a valid code/allowed domain is rejected; valid ones succeed.
- Suggested files: `src/app/api/auth/signup/route.ts`, `AuthForm.tsx`, `.env.example`
- Validation: attempt signup with/without a valid code.
- Delegation prompt:
  > Implement TICKET-020 per repository context; keep the check server-side, add a test, report results.

---

## How to use this backlog

- **Start here (first three):**
  1. **TICKET-001 (Postgres)** — without it, any real deployment loses all data. Prerequisite for a live cohort.
  2. **TICKET-002 (durable pub/sub)** — the headline realtime feature silently half-breaks on multi-instance hosting; fix before scaling beyond one node.
  3. **TICKET-005 (Playwright E2E)** — lock in the verified realtime behavior with an automated guard before piling on features.
- **Priority counts:** P0 × 2 · P1 × 5 · P2 × 9 · P3 × 4 (20 tickets).
- **Learning briefs:** each ticket's "Learning brief" explains the problem, impact,
  proposed change, and one concept in plain terms — use them to brief a junior
  engineer or a delegated agent, or to decide scope in review without reading the code first.
- **Could not run:** cross-*user* (two-cookie-jar) realtime and mobile/dark visual
  screenshots weren't captured in this environment (see Verification Summary);
  TICKET-005 and a visual-QA pass close those gaps.
