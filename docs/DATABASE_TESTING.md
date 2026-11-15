# CINEVA database testing and verification

## Checks available in this workspace

The repository has `npm run typecheck` and `npm run build`; it has no ESLint or unit-test scripts and no Supabase CLI/PostgreSQL executable. The catalogue importer's report-only mode can run without external access. Two pgTAP files exist under `supabase/tests/`: structural checks and negative RLS isolation checks. SQL migrations, RLS tests, Storage, auth, live queries and import apply/parity were not executed. Run results are summarized in the handover report.

## Test layers for a configured disposable Supabase project

1. Apply both migrations to a new local Supabase instance; fail on any SQL error. Verify all 39 tables have RLS and the expected indexes, checks, foreign keys, functions and three buckets exist.
2. Run `supabase test db` (or the project's configured pgTAP command) with structural tests. Add constraint tests for duplicate scoped slugs/legacy IDs, duplicate child numbers, invalid target/source combinations, duplicate favorites/list entries/ratings/history, and invalid roles/statuses.
3. Seed disposable auth identities for anonymous, user A, user B, moderator, and administrator. Test allowed and forbidden SELECT/INSERT/UPDATE/DELETE paths for every RLS family; include explicit negative cross-user tests and nonparticipant message/storage reads.
4. Verify auth trigger provisions profile and user role; test direct conversations, block behavior, message send, attachment paths, receipts, report-scoped moderation, notifications and audit records in transactions.
5. Run importer dry-run and apply against disposable DB. Rerun apply, verify no duplicate rows, then compare all records and reference URLs against source arrays. Confirm sources remain inactive/non-public and content remains draft.
6. Exercise server catalogue adapter against public REST with published and draft records; verify pagination, nested relationship mapping, unavailable/null metadata, network failure handling and no private source leakage.
7. Run app TypeScript, lint if later configured, unit tests, database tests, production build, dependency audit, browser smoke tests and restore rehearsal.

## Required negative RLS cases

- Anonymous cannot read draft/archived catalogue, inactive source URLs, private profile/activity/messaging, or unpublished announcements.
- User A cannot read or mutate User B's profile, preferences, favorites, watchlists, history, ratings, notifications, messages, receipts, or attachment objects.
- A nonparticipant cannot enumerate/read a conversation or obtain attachments. User cannot add arbitrary participants or forge sender/recipient IDs.
- Moderator without `messages.moderate` cannot use exceptional message inspection. Ordinary users cannot modify role assignments, notification payload/recipient, moderation history, or admin audit log.
- Suspended users cannot initiate new messages or personal writes where active status is required.

Tests need separate JWT roles; running all SQL as the database owner bypasses RLS and is not a security test. Never use real user data for test accounts.
