# CINEVA integration implementation checklist

## Inspection gates (complete before code changes)

- [x] Inventory app routes, components, data, libraries, migrations, tests, docs, assets, and package scripts.
- [x] Read all route and layout source files and inspect the `Studio.tsx` interaction surface.
- [x] Inspect source catalogue shape and current PostgREST adapter/type relationships.
- [x] Read architecture, setup, testing, security, relationship, migration, Phase 2 and Phase 3 docs.
- [x] Map grants, RLS policies, RPCs, triggers, and Storage rules against requested features.
- [x] Read installed Next.js 16 docs for App Router, server/client components, Proxy, route handlers, and mutation patterns.
- [x] Record missing configuration and external dependencies without printing secrets.

## Implementation sequence

- [x] Add typed Supabase browser/server clients, publishable-key-only client access, and cookie refresh through Next.js 16 `proxy.ts` (static checks pass; live requests need project URL).
- [x] Implement registration, login, logout, confirmation/recovery callback, password update, protected account/admin/message pages, and profile display-name/image handling (not live-tested).
- [x] Preserve movie/series data files; catalogue mapping now retains database UUIDs and series genres, while search/category filtering uses returned records (hosted catalogue read not tested).
- [x] Persist favorites under the authenticated user; record playback position/completion in owner-scoped `watch_history` on actual video playback (no aggregate view-count RPC exists; live writes not tested).
- [x] Add direct conversations, message history/send, paging, read receipts, previews, block/unblock, and reporting through current tables/RPCs; group creation and attachments remain blocked by schema/security state.
- [x] Add user-specific unread count RPC usage with an RLS-scoped fallback, Realtime subscriptions and cleanup. New database support migrations remain unapplied; Realtime not live-tested.
- [x] Add admin operations with per-action permission checks and existing database RPC authorization, plus audited message-review access (not live-tested).
- [x] Prepare (do not apply) a minimal security migration for the identified block/suspension/attachment metadata gaps.
- [x] Run final typecheck and production build after the last edits; static structure checks passed for the four new migrations. Live SQL execution remains blocked.

## Known non-code gates

- [ ] `.env.local` is gitignored and contains the supplied publishable key; `NEXT_PUBLIC_SUPABASE_URL` is blank because no canonical project base URL was present. The provided `/rest/v1/` endpoint is not accepted as an SDK project base URL. Auth, hosted reads/writes, Realtime, Storage, and live RLS testing are blocked until the canonical project URL is supplied/configured.
- [ ] Current package scripts include only `typecheck` and `build`; no lint or automated app tests are configured.
- [ ] The prepared messaging hardening migration `20261109000100` remains unapplied and must be reviewed/tested in an isolated development database before private attachments or suspended/blocked messaging can be treated as secure. Signed URLs remain bearer capabilities. Group creation remains unsupported by the current database workflows.
- [x] Official dependencies are installed and verified: `@supabase/supabase-js@2.119.0`, `@supabase/ssr@0.12.7`.
- [x] The repository directory has no `.git` metadata; Git status/diff cannot be used. Changes were kept to the listed implementation files and checklist.

## Current stage status

- [x] Project inspection and implementation checklist.
- [x] Prepare the minimal messaging security migration; not applied.
- [ ] Supabase SDK integration is implemented but runtime integration remains blocked by missing canonical project URL; no hosted tests or SQL migrations were applied.
- [x] Final `npm run typecheck` and `npm run build` passed. `npm run lint` is not configured; no JavaScript test script is configured. SQL tests were not executed because psql, Docker, and local PostgreSQL are unavailable and the Supabase CLI wrapper could not write its telemetry file outside the workspace.

## Implementation added in this continuation

- Browser/server Supabase clients, cookie-aware server client, session-refresh proxy, auth callback/actions and account pages.
- Persistent profile display-name edits, private profile image uploads, RLS-scoped favorites and per-user playback history.
- Participant inbox with direct-message RPC, pagination, read receipts, Realtime listeners, block/report controls, conversation preview, and authenticated user-ID sharing.
- Admin user/report/catalogue/audit screens; exceptional private-message review uses the audit-writing database RPC only.
- New unapplied migrations: `20261109000200_support_contact_lookup.sql`, `20261109000300_conversation_activity.sql`, `20261109000400_private_inbox_counts.sql`, `20261109000500_private_realtime_publication.sql`.
- Not implemented: private attachment transfer (pending hardening migration and live RLS verification), group-conversation creation, recipient discovery beyond shared account UUIDs, and aggregate catalogue view counts (no trusted RPC exists).
