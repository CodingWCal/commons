# Commons — Product Requirements Document

> **Status:** Execution-ready · **Delivery mode:** `phased` (Prototype shipped → Production-readiness gates documented)
> **Owner:** Calvin V. (@CodingWCal) · **Context:** Cursor Boston — Week 2 build
> **Last updated:** 2026-07-23

---

## 1. Product Frame

- **Product name:** Commons
- **One-sentence pitch:** A focused, real-time team chat for the Cursor Boston cohort — channels, presence, and message history with zero setup and a clean, calm interface.
- **Target users:** Members of the Cursor Boston Week 2 cohort (peers + facilitators). Small, trusted group (assume ≤ 50 users, single workspace).
- **Primary job to be done:** "When I'm working alongside my cohort, I want one shared, low-noise place to ask questions, share links, and coordinate in real time — without the sprawl and notification overload of a full Slack/Discord."
- **Problem statement:** Cohort communication currently scatters across DMs, email, and general-purpose chat tools that are noisy, over-featured, and require accounts/invites/admin setup. There is no single, purpose-built, instantly-runnable space scoped to *this* cohort.
- **Why now:** Week 2 requires a demoable, production-grade build. A focused chat is a well-understood domain that exercises auth, real-time data, persistence, and polished UI — an ideal showcase — and the cohort has an immediate real use for it.
- **Desired outcome:** A cohort member can clone the repo, run two commands, and have a working chat where multiple people sign up, join channels, and exchange messages that appear in real time and persist across reloads. Architecture is honest about its production path (Postgres + pub/sub).
- **Non-goals (this build):**
  - Direct messages / private 1:1 threads (backlog).
  - Threaded replies, reactions, file/image uploads (backlog).
  - Voice/video, screen share.
  - Multi-workspace / multi-tenant org management.
  - Mobile native apps (responsive web only).
  - Federation, external integrations (GitHub/Calendar bots), search over history (backlog).
  - Push notifications / email digests.

---

## 2. Delivery Mode

**Chosen mode: `phased`.**

- **Rationale:** The user needs a *working* app this session (favoring an MVP loop) that is also *production-grade ready* (favoring hardening). `phased` lets us ship a verifiable prototype now while explicitly documenting the gates that turn it into a production release, so prototype shortcuts (SQLite, in-process SSE bus) don't silently masquerade as production architecture.
- **Quality bar (Prototype / this session):**
  - Runs with `npm install && npm run dev`, no external accounts or keys.
  - TypeScript strict, ESLint clean, `next build` passes.
  - Real persistence (SQLite via Prisma), real credential auth (bcrypt + signed httpOnly session cookie).
  - Real-time delivery verified live across two concurrent browser sessions.
  - Polished, responsive, accessible-by-default UI with light/dark support.
- **Quality bar (Production-readiness gate):** See §9–§13. Swap SQLite→Postgres, in-process SSE bus→durable pub/sub, add rate limiting, observability, backups, and E2E tests.

---

## 3. User Workflows

### WF-1 — Create account & enter the Commons
- **User intent:** Get into the cohort chat.
- **Entry point:** `/` (unauthenticated) → redirect to `/login`; `/signup` link.
- **Happy path:** Enter display name + email + password → account created (bcrypt hash) → session cookie set → land in default `#general` channel.
- **Empty/loading/error states:** Inline field validation (Zod); "email already registered" error; disabled submit while pending; network error toast.
- **Edge cases:** Duplicate email; weak password (< 8 chars) rejected; whitespace-only display name rejected; already-authenticated user hitting `/login` is redirected to app.
- **Completion signal:** User sees the app shell with channel list + message pane focused on `#general`.
- **Required human approvals:** None (self-serve signup within the cohort).

### WF-2 — Read & send messages in a channel
- **User intent:** Communicate in real time.
- **Entry point:** App shell → select a channel in the sidebar.
- **Happy path:** Channel history loads (most recent N) → user types → Enter sends → message appears optimistically → confirmed via server → other connected members receive it in < 1s via SSE.
- **Empty/loading/error states:** Skeleton while history loads; "No messages yet — say hi 👋" empty state; failed send shows retry affordance; reconnect banner if SSE drops.
- **Edge cases:** Very long message (cap 4,000 chars); rapid sends (client debounce + server rate guard); message from a user who since changed display name (render current name); reconnection replays missed messages since last seen id.
- **Completion signal:** Sent message is confirmed (optimistic → persisted) and visible to all connected members.
- **Required human approvals:** None.

### WF-3 — Create / join a channel
- **User intent:** Organize conversation by topic (e.g., `#week-2`, `#help`, `#showcase`).
- **Entry point:** Sidebar "+ New channel".
- **Happy path:** Enter name (slugified, unique) + optional description → channel created → user auto-joins → channel appears in everyone's list.
- **Empty/loading/error states:** Duplicate slug error; invalid name error; creating spinner.
- **Edge cases:** Reserved/empty names; case-insensitive uniqueness; channel list ordering (general first, then alphabetical).
- **Completion signal:** New channel is selected and ready for messages.
- **Required human approvals:** None (any member can create; moderation is a backlog concern).

### WF-4 — See who's online (presence)
- **User intent:** Know who's around.
- **Entry point:** Sidebar presence section / avatars in channel header.
- **Happy path:** On connect, user is marked online; a heartbeat keeps them online; on disconnect/timeout they go offline; other clients see presence updates live.
- **States:** Online (green), offline (muted). Loading = last-known state.
- **Edge cases:** Multiple tabs (union of connections); stale presence reaped after heartbeat timeout.
- **Completion signal:** Presence list reflects currently-connected members within a few seconds of change.

### WF-5 — Sign out
- **Entry point:** User menu.
- **Happy path:** Clears session cookie → redirect to `/login`; presence goes offline.

---

## 4. Agentic Workflow

- **What the user delegates:** Full implementation of the prototype from this PRD; scaffolding; running/verifying locally; producing the backlog; pushing to a public GitHub repo.
- **What the agent plans:** Data model, route/component structure, SSE realtime design, auth flow, UI system.
- **What the agent may change without approval:** All source code, config, docs, tests inside the `commons/` project folder; local git commits.
- **What always requires approval:** Creating the public GitHub repo / pushing (explicitly authorized by the user for this task); any external side effects beyond that; adding paid/external services; deleting anything outside the project folder.
- **Tools / repos / env the agent needs:** Node 22, npm, git, `gh` CLI (authenticated as CodingWCal), local dev browser for verification.
- **How work is verified:** `npm run build` + `npm run lint` + unit tests + live preview-browser check of signup, messaging, and cross-session realtime (see §12).
- **How partial/failed work is recovered:** Work committed in logical chunks; dev server logs + browser console inspected on failure; revert via git if a change breaks the build.

---

## 5. Functional Requirements

Priorities: **P0** = required for Prototype exit; **P1** = strongly desired this session; **P2** = backlog.

| ID | Requirement (testable) | Priority | Acceptance / Verification |
|----|------------------------|----------|---------------------------|
| FR-001 | Users can sign up with display name, unique email, and password (≥ 8 chars). Passwords stored only as bcrypt hashes. | P0 | Create account; inspect DB — `passwordHash` is a bcrypt string, no plaintext. Duplicate email rejected with 409/inline error. |
| FR-002 | Users can log in and out. A signed, httpOnly, SameSite cookie represents the session; expiry enforced. | P0 | Log in → protected routes accessible; cookie flags correct; logout clears cookie; expired/invalid cookie → redirect to `/login`. |
| FR-003 | All app routes and message APIs require a valid session; unauthenticated access redirects/401s. | P0 | Hit `/` and `/api/*` without cookie → redirect/401. |
| FR-004 | Users can view a list of channels; `#general` exists by default (seeded). | P0 | Fresh DB shows `#general`; list renders in sidebar. |
| FR-005 | Users can create a channel with a unique, slugified name + optional description. | P1 | Create `#week-2`; duplicate rejected; appears for all members. |
| FR-006 | Users can send a message (≤ 4,000 chars) to a selected channel; it persists. | P0 | Send message; reload page → message still present (loaded from DB). |
| FR-007 | Messages from other users appear in the open channel in < 1s without reload (SSE). | P0 | Two browsers, same channel; A sends, B sees it live. |
| FR-008 | Channel history loads most-recent messages on open, ascending by time, with sender name + timestamp. | P0 | Open channel with history → messages ordered correctly with metadata. |
| FR-009 | Presence: connected users are shown online; disconnected users drop off within the heartbeat window. | P1 | B connects → A sees B online; B closes tab → A sees B offline within timeout. |
| FR-010 | Optimistic send: sender sees their message immediately; reconciled with server id; failure shows retry. | P1 | Throttle network → message shows pending then confirmed; forced failure shows retry. |
| FR-011 | Input is validated server-side with Zod on every mutating endpoint; invalid input returns 400 with a safe message. | P0 | Send oversized/empty message via API → 400; no DB write. |
| FR-012 | SSE reconnect: on drop, client reconnects and backfills messages missed since last received id. | P1 | Kill/restore connection → missed messages appear once, in order, no dupes. |
| FR-013 | Responsive layout: usable from 360px mobile width to desktop; sidebar collapses on small screens. | P1 | Resize to mobile → sidebar toggling works; no horizontal scroll. |
| FR-014 | Light/dark theme respects system preference. | P1 | Toggle OS theme → UI adapts; contrast preserved. |
| FR-015 | Basic per-user send rate guard (e.g., ≤ 10 msg / 5s) to prevent accidental floods. | P1 | Rapid-fire sends → excess throttled with feedback. |
| FR-016 | Direct messages (1:1). | P2 | — (backlog) |
| FR-017 | Reactions, threads, edits/deletes, file uploads, search. | P2 | — (backlog) |

Dependencies: FR-002 depends on FR-001; FR-006/007/008 depend on FR-002 + FR-004; FR-012 depends on FR-007.

---

## 6. Design Phase and UX Requirements

- **Core screens:** `/login`, `/signup`, and the app shell (`/` and `/c/[slug]`): left **sidebar** (workspace title, presence, channel list, new-channel, user menu) + main **message pane** (channel header, scrollable message list, composer).
- **Navigation model:** Single-page app shell; channel selection via routes `/c/[slug]`; auth pages are standalone.
- **Input controls:** Auth forms; message composer (multiline textarea, Enter to send, Shift+Enter newline); new-channel modal.
- **Feedback/status states:** Optimistic message states (pending/sent/failed), connection banner (live/reconnecting), presence dots, empty states, skeleton loaders, toasts for errors.
- **Accessibility:** Semantic landmarks (`nav`, `main`), labeled inputs, visible focus rings, keyboard-operable composer and channel switching, `aria-live="polite"` on the message list for new-message announcements, WCAG AA contrast.
- **Responsive:** Mobile-first; sidebar becomes a toggle drawer below `md`. No horizontal overflow at 360px.
- **Copy tone:** Warm, concise, human. Encouraging empty states. No corporate filler.

### Visual direction (implementation constraints)
- **First impression (5s):** "Calm, focused, well-crafted — a quiet room, not a firehose."
- **References (mood, not clone):** Linear (restraint, typographic hierarchy), Campsite/Height (calm chat), a touch of editorial warmth. Intentionally **differ from** Slack/Discord density and notification noise.
- **Aesthetic keywords:** calm, editorial, tactile, precise, warm-neutral.
- **Identity:** "Commons" evokes Boston Common — a shared green. Signature accent = **commons green** with a **warm brick** secondary; on a warm paper/ink neutral base.
- **Design tokens (CSS custom properties, defined once in `globals.css`):**
  - Accent: `--commons` (green) + `--commons-soft`; secondary `--brick`.
  - Text: `--ink`, `--ink-2` (muted), `--ink-3` (subtle).
  - Surfaces: `--paper` (page), `--paper-2` (sidebar/cards), `--paper-3` (wells/composer).
  - Lines: `--rule`, `--rule-2`. Radii: `--radius-sm/md/lg`.
  - Full dark-mode variable set via `prefers-color-scheme`.
- **Typography:** System-ish stack or one tasteful display face for the wordmark + a clean sans for UI; monospace for code spans. Keep it fast (no heavy webfont blocking).
- **Iconography:** Lightweight inline SVG (lucide-style), 1.5px stroke.
- **Motion:** Subtle — message enter fade/slide (~120ms), presence dot transitions; respect `prefers-reduced-motion`.
- **Layout density:** Comfortable, generous line-height in messages; compact sidebar.
- **To avoid:** Generic purple SaaS gradients, glassmorphism, heavy shadows, stock illustration, enterprise data-grid density.
- **Component inventory:** `AppShell`, `Sidebar`, `ChannelList`, `PresenceList`, `ChannelHeader`, `MessageList`, `MessageItem`, `Composer`, `NewChannelDialog`, `UserMenu`, `AuthForm`, `ConnectionBanner`, `Avatar`, `EmptyState`, `Toast`.
- **Visual QA acceptance:** Verify at **360×780 (mobile)**, **768×1024 (tablet)**, **1280×800 (desktop)**, in **light and dark**. Interaction states to test: focus rings, hover, pending/failed message, empty channel, reconnecting banner, presence change.

---

## 7. Data and Integration Requirements

- **Key entities (Prisma):**
  - `User` — id, email (unique), displayName, passwordHash, avatarColor, createdAt.
  - `Session` — id (opaque token hash), userId, expiresAt (DB-backed sessions; cookie carries token).
  - `Channel` — id, slug (unique), name, description?, createdById, createdAt.
  - `Membership` — userId + channelId (unique pair), joinedAt. (All users auto-member of `#general`; creators auto-join.)
  - `Message` — id, channelId, userId, body, createdAt (indexed on `[channelId, createdAt]` and `id` for backfill).
- **Data lifecycle:** Messages retained indefinitely for the prototype (no deletion UI). Sessions expire (e.g., 7 days) and are reapable.
- **Persistence model:** Prisma ORM. **SQLite** (`file:./dev.db`) for the prototype; **Postgres** for production via `DATABASE_URL` + `provider` change — no application-code change. Migrations via `prisma migrate`.
- **Realtime transport:** **Server-Sent Events** (`GET /api/stream`) per connected client, fed by an in-process `EventEmitter` bus. Message create → persist → publish to bus → fan out to subscribers of that channel. **Production:** replace the in-process bus with Postgres `LISTEN/NOTIFY` or Redis pub/sub so it works across instances.
- **External APIs / webhooks / background jobs:** None for the prototype. Presence heartbeat + session reaping run in-process.
- **File handling:** None (uploads are backlog).
- **Migrations:** Committed Prisma migration + a seed script (`prisma/seed.ts`) creating `#general`.
- **Import/export:** None (backlog).
- **Data deletion:** Not user-exposed in prototype; documented as a production requirement (GDPR-style delete) in §9.

---

## 8. AI and Agent Behavior

Not applicable — Commons contains **no** AI/LLM features in this build. (A future "cohort assistant" bot is a backlog idea and would get its own PRD section covering provider, prompt strategy, tool boundaries, and abuse/prompt-injection defenses.)

---

## 9. Security, Privacy, and Abuse

**Prototype (implemented now):**
- **AuthN:** Email + password; bcrypt (cost ≥ 10). No plaintext passwords, ever.
- **AuthZ:** All app routes + mutating APIs require a valid session. Users may only act as themselves (server derives userId from session, never trusts client-supplied userId).
- **Session:** Opaque random token, stored hashed in DB; cookie is `httpOnly`, `SameSite=Lax`, `Secure` in production, with expiry.
- **Secrets handling:** `SESSION_SECRET` from env (`.env`, git-ignored); `.env.example` documents required vars. No secrets committed.
- **Input validation:** Zod on every mutating endpoint; length caps; slug sanitization.
- **Rate limiting:** In-memory per-user message rate guard (prototype); documented Redis/token-bucket upgrade for production.
- **Data classification:** Low sensitivity (cohort chat) but treat email + password with care.
- **Dependency/supply-chain:** Pin versions via lockfile; `npm audit` in CI (documented).

**Production-readiness requirements (documented, gated):**
- CSRF protection on cookie-auth mutations (double-submit token or same-site enforcement + origin check).
- Durable, distributed rate limiting; abuse/spam controls; per-channel moderation + admin role.
- Audit logging for auth events and channel/message admin actions.
- Encryption in transit (TLS at the platform) and at rest (managed Postgres).
- Privacy & retention policy; user data export + hard delete.
- Threat model review (session fixation, XSS via message rendering — messages rendered as text, never `dangerouslySetInnerHTML`; SSRF n/a; enumeration on login uses generic errors).
- Incident response + on-call ownership.

**Abuse cases considered:** message flooding (rate guard), oversized payloads (length caps + body-size limit), XSS via message body (escaped/text-only rendering), auth brute force (documented lockout/throttle for production), channel-name squatting/reserved names.

---

## 10. Reliability and Operations

- **Availability target:** Prototype = best-effort local/single-node. Production target (documented) = 99.9%.
- **Scale assumptions:** ≤ 50 concurrent cohort users, low message volume. Single node handles this comfortably. Production scale-out requires the pub/sub swap (see §7).
- **Performance budgets:** Local realtime delivery < 1s (target p95 < 500ms); channel history load < 300ms for recent N; initial app shell interactive < 2s on dev.
- **Observability:** Prototype = structured server logs. Production = request logging, error tracking (e.g., Sentry), SSE connection metrics.
- **Alerts:** Production only (error rate, SSE disconnect spikes).
- **Backup/restore:** SQLite file is the prototype "backup"; production = managed Postgres automated backups + tested restore.
- **Rollback plan:** Vercel/host immutable deploys + `git revert`; DB migrations are additive/reversible where possible.
- **Feature flags:** Not required for prototype.
- **Admin tooling / support:** Prisma Studio for prototype DB inspection; production needs an admin role + moderation UI (backlog).

---

## 11. Acceptance Criteria (Given / When / Then)

**AC-1 (FR-001/002/003 — Auth gate)**
- Given an unauthenticated visitor, When they open `/`, Then they are redirected to `/login`.
- Given valid signup details, When submitted, Then a `User` is created with a bcrypt `passwordHash`, a session cookie is set, and they land in `#general`.
- **Verification:** Manual live check + DB inspection + unit test on the password hashing/verify util.

**AC-2 (FR-006/007/008 — Realtime messaging)**
- Given two members A and B viewing `#general`, When A sends "hello", Then B sees "hello" within 1s without reloading, and after a full page reload the message is still present for both.
- Given an empty channel, When opened, Then an empty-state prompt is shown.
- **Verification:** Two concurrent preview-browser sessions; reload check.

**AC-3 (FR-005 — Channels)**
- Given a member, When they create `#week-2`, Then it appears in the sidebar for all members and is selectable; a duplicate slug is rejected with a clear error.
- **Verification:** Live check + API 409 test.

**AC-4 (FR-009 — Presence)**
- Given A online, When B connects, Then A sees B as online within a few seconds; When B disconnects, Then B is shown offline within the heartbeat timeout.
- **Verification:** Two sessions; open/close.

**AC-5 (FR-011 — Validation / negative cases)**
- Given the message API, When called with an empty or >4,000-char body or without a session, Then it returns 400/401 respectively and writes nothing to the DB.
- **Verification:** API tests.

**AC-6 (FR-012 — Reconnect)**
- Given a dropped SSE connection, When it restores, Then messages sent during the gap are delivered exactly once, in order.
- **Verification:** Manual disconnect + backfill check.

Negative/edge coverage: duplicate email, weak password, duplicate channel slug, oversized message, unauthenticated API access, reconnection dedupe.

---

## 12. Test and Evaluation Plan

- **Unit tests:** password hash/verify; Zod schemas; slugify; session token create/verify; rate-guard logic; message-backfill selector.
- **Integration tests:** auth route handlers (signup/login/logout); message create → persisted + published; channel create uniqueness.
- **End-to-end (documented; Playwright as production gate):** signup → send message → second session receives it. For this session, E2E is performed as a **live manual verification in the preview browser** and recorded via screenshot.
- **Visual checks:** Screenshots at mobile/tablet/desktop in light+dark; verify empty state, pending/failed message, reconnecting banner, presence.
- **Accessibility checks:** Keyboard-only send + channel switch; focus visibility; `aria-live` message announcements; contrast spot-check.
- **Security checks:** Confirm no plaintext password; cookie flags; message body rendered as text (XSS attempt `<img onerror>` shows as literal text); unauth API blocked.
- **Load/performance:** Informal — burst 50 messages, confirm ordering + no UI jank (formal load test is a production gate).
- **Manual review checklist:** build clean, lint clean, no secrets committed, `.env.example` present, README run steps accurate.

---

## 13. Milestones and Cut Lines

### Phase 0 — Prototype (THIS SESSION) ✅ target
- **Scope:** FR-001–FR-014 (P0 all; P1 as time allows), self-contained stack, live-verified realtime, polished responsive UI, README, PRD, backlog, public GitHub repo.
- **Entry criteria:** Stack confirmed (self-contained), folder + repo naming confirmed.
- **Exit criteria:** `npm install && npm run dev` works from clean clone; AC-1, AC-2, AC-3 verified live; `next build` + lint pass; pushed to public repo.
- **Cut lines (drop first if time-constrained):** presence (FR-009) → reconnect backfill (FR-012) → dark mode (FR-014) → rate guard (FR-015). Auth + persistent realtime messaging + channels are **not** cuttable.
- **Risks:** OneDrive file-locking during `npm install`; SSE behavior under dev HMR; Windows path quirks.
- **Verification:** §12 live checks + screenshots.

### Phase 1 — Private beta (cohort, real use)
- **Scope:** Deploy to a single-node host (Render/Railway/Fly) with **Postgres**; keep in-process SSE bus (single instance). Add basic moderation (delete own message), CSRF, and error tracking.
- **Entry:** Prototype exit met. **Exit:** 10+ cohort members using it for a week without data loss.
- **Cut line:** No multi-instance scaling yet.

### Phase 2 — Public beta
- **Scope:** Multi-instance ready — replace SSE in-process bus with Postgres `LISTEN/NOTIFY` or Redis pub/sub; distributed rate limiting; DMs + reactions; search.
- **Entry:** Phase 1 stable. **Exit:** Horizontal scale verified; abuse controls live.

### Phase 3 — Production readiness
- **Scope:** Full §9–§10 production requirements: audit logging, backups + tested restore, observability/alerts, privacy (export/delete), accessibility audit, Playwright E2E in CI, load tested.
- **Entry:** Public beta stable. **Exit:** Production quality bar (§2) fully met; incident/on-call ownership assigned.

---

## 14. Open Questions

- **Product:** Should channel creation be open to all members or facilitator-gated? (Assumption: open for prototype.) Should there be a single fixed workspace name? (Assumption: "Cursor Boston" workspace, single-tenant.)
- **Technical:** Which host for Phase 1 (Render vs Railway vs Fly)? Confirm Postgres provider (Supabase Postgres is the likely pick given prior experience).
- **Security:** Is generic cohort-trust acceptable for open signup, or should signup require an invite code/allowlist by email domain? (Assumption: open signup for prototype; invite-code is a strong Phase-1 candidate.)
- **Operational:** Who owns moderation once the cohort uses it for real?
- **Decisions needed from user:** None to start the build — all above have working assumptions. Flag the invite-code question before real cohort rollout.

---

## 15. Agent Handoff Brief

- **Build objective:** Ship the Phase-0 prototype of Commons per this PRD — a self-contained, real-time cohort chat that runs with two commands and is production-architecture-honest.
- **Current assumptions:** Single workspace ("Cursor Boston"); open signup; SQLite + in-process SSE for prototype; Postgres + pub/sub documented as the production path.
- **Files/repos to inspect:** This PRD (`docs/PRD.md`); `CLAUDE.md`/`README.md` once scaffolded; `prisma/schema.prisma`.
- **Commands to run:**
  - `npm install`
  - `npx prisma migrate dev` (or `db push`) + `npm run db:seed`
  - `npm run dev`
  - `npm run build` / `npm run lint` / `npm test`
- **First implementation slice:** Scaffold Next.js → Prisma schema + migrate + seed `#general` → credential auth (signup/login/logout + session middleware) → app shell with channel list + message list + composer reading/writing to DB (no realtime yet) → then layer SSE realtime → then presence.
- **Verification commands:** `npm run build`, `npm run lint`, `npm test`; live preview-browser check of AC-1/AC-2/AC-3 across two sessions.
- **Approval gates:** Creating/pushing the public GitHub repo (authorized for this task). No other external side effects.
- **Definition of done (Phase 0):** Clean clone runs in two commands; auth + persistent, real-time channel messaging + presence work and are live-verified; build + lint + tests pass; no secrets committed; `.env.example`, README, PRD, and BACKLOG present; pushed to a public repo under @CodingWCal.
