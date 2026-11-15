# CINEVA migration security review — phase 5

**Review date:** 2026-11-10  
**Scope:** migrations `20261108000100` through `20261109000500`, read in filename/execution order. Phase 5 follow-up corrections `20261110000100_private_activity_write_guards.sql` and `20261110000200_profile_display_name_provisioning.sql` are reviewed below.  
**Execution status:** static source review only. No migration was applied, and no hosted database was queried.

## Decision

The five phase 5 changes are narrowly scoped and their declared dependencies are present in the two foundation migrations. Their `SECURITY DEFINER` functions use qualified object names and fixed `search_path` values; the new callable functions revoke `PUBLIC`/`anon` execution and grant only authenticated execution where needed. The Realtime change is catalog-guarded and idempotent.

**Conditional decision: suitable for isolated disposable development testing after the noted test-coverage corrections below; not approved as a claim of verified production safety.** The migrations have not been parsed or executed by PostgreSQL in this environment. The existing tests cover only a small subset of the requested RLS matrix. The foundation migrations are one-time bootstrap scripts, not rerunnable reset scripts, and should only be applied to a new empty local Supabase database using the CLI migration runner.

No source correction is made by this review. The identified test gaps do not require changing policies speculatively; first run the full behavior matrix on an isolated database, then correct any demonstrated policy defect in a follow-up migration.

## Environment and testing boundary

- `supabase/config.toml` configures local API/database/auth/storage services and PostgreSQL major version 17. It disables seeding.
- Docker was not found on `PATH` or at the standard Docker Desktop executable path. `docker`, `psql`, and a global `supabase` command were not discoverable.
- A project-local Supabase CLI package exists in `node_modules`, but its version probe failed because the CLI attempted to write telemetry under the non-writable user profile (`C:\Users\dufit\.supabase`). This does not establish that the CLI is unusable with a permitted telemetry location; it does mean the CLI version was not confirmed here.
- `supabase/.temp/linked-project.json` exists. This is evidence that the working CLI metadata has been linked to a project; it is not evidence that the target is disposable. Do not use linked-project commands or credentials for this review.
- No live database or Docker container was inspected. No migrations, tests, test users, or hosted data were changed.

### Safest isolated procedure (after Docker and local CLI are usable)

1. Verify Docker Desktop is running and verify the pinned/local CLI version without using any linked-project operation.
2. Review the configured local stack settings. Run `supabase start` from this repository; this starts the local stack described by `supabase/config.toml`, not the linked hosted project.
3. Confirm the displayed DB/API endpoints are loopback/local before any SQL action. Do not use `supabase link`, `db push`, or hosted SQL Editor for this procedure.
4. On the new disposable local stack only, run `supabase db reset`. The CLI applies migrations in timestamp order, including the two foundation migrations first. Confirm the migration history and local endpoint before running tests.
5. Run `supabase test db`, then the documented authenticated API behavior tests using only synthetic accounts in this local stack. The current SQL pgTAP tests are not a substitute for signed-user API tests.
6. Save redacted outputs and remove/discard the disposable local stack when complete. Do not copy credentials, JWTs, private message bodies, or signed URLs into this report.

Do not proceed to migration application until Docker and the local CLI work, the project endpoint is confirmed local, and the user separately authorizes applying migrations. This review itself did not authorize that write.

## Execution-order review

### 1. `20261108000100_initial_schema.sql`

**Dependencies:** Supabase-managed `auth`, `storage`, and `extensions` schemas and their standard roles; PostgreSQL support for `pgcrypto`, partial indexes, deferrable constraint triggers, and `num_nonnulls`. Creates application tables before their foreign keys and uses `auth.users`/`storage.buckets`.

**Changes:** Creates the 39-table catalogue, user, activity, messaging, moderation, and audit model; indexes and integrity triggers; seeds roles/permissions; provisions three Storage buckets. It also creates profile/subtype provisioning and notification triggers/functions.

**Security implications:** This file alone is not the security boundary; RLS, grants, policies, and most privileged function controls arrive in the next migration. Do not expose the schema before `20261108000200` has completed. Foundation functions use explicit `search_path`; security-definer trigger functions are intended for trigger execution and are revoked in the next migration. The private attachment bucket is configured non-public with a MIME allowlist and 20 MiB cap, which is a useful platform guard but not content-signature validation.

**Failure / repeatability:** Requires a Supabase database with managed schemas/extensions and the expected Storage tables. Existing application tables/constraints/triggers cause failure: this is a fresh-database bootstrap, not idempotent. `ON CONFLICT DO NOTHING` on seeds/bucket rows does not make the overall migration rerunnable. Existing bucket configuration is not reconciled by that insert.

**Corrections / isolated test suitability:** No source correction established by static review. For isolated testing, apply first to a fresh local Supabase database. Verify profile trigger behavior, deferred subtype/direct-conversation constraints, seed behavior, Storage bucket configuration, and all functions/triggers. Do not manually run it on a populated project.

### 2. `20261108000200_security_and_operations.sql`

**Dependencies:** All objects from `20261108000100`; Supabase auth claim helpers and Storage RLS; seeded roles/permissions. It adds grants, RLS, policies, RPCs, audit logic, and operations.

**Changes:** Defines permission, account status, participant, and block helpers; direct-conversation creation; audited report-scoped message retrieval/moderation and administrative routines; row grants/revocations and RLS on the 39 application tables; policies for catalogue, profiles, activity, messaging, notifications, moderation, audit and Storage.

**Security implications:** Most privileged functions are `SECURITY DEFINER` with fixed search paths and explicit execute grants/revocations. `get_reported_message_for_moderation` checks `messages.moderate`, requires an open/reviewing report, writes an audit row, and returns the body; direct message SELECT is not granted to administrators merely for being administrators. Direct conversation creation canonicalizes participant IDs and checks active accounts and blocks. However, the original message edit, attachment upload, and attachment metadata write policies are permissive after a block/suspension; migration 001 hardening revises these. The original participant helper does not itself require account-active status; migration 001 hardening revises it. Message/report metadata and attachment object keys need the behavior tests specified below.

**Failure / repeatability:** Also a one-time migration: policies, triggers, and objects are created without broad `IF NOT EXISTS`. It depends on Supabase-managed schemas and role grants. Any earlier partial manual application can leave conflicting objects. Review seeds and grants before execution; do not use this script as an ad hoc repair.

**Corrections / isolated test suitability:** The later hardening migration addresses selected message write/read gaps and metadata exposure. Remaining policy behaviors must be verified with distinct authenticated API actors, especially message reports, profile admin access, and storage. Isolated testing only, after migration 1.

### 3. `20261109000100_messaging_security_hardening.sql`

**Dependencies:** The policies and helpers established in `20261108000200`, including `is_active_user()`, `is_blocked_between(uuid,uuid)`, conversation/message/attachment tables, and `storage.objects` policies.

**Changes:** Replaces `is_conversation_participant(uuid)` so only active, currently joined participants qualify; recreates sender message-update and attachment-metadata insert policies to require an active unblocked participant; replaces private Storage attachment read/upload policies with active-participant and block checks; narrows public artwork metadata policy so `content.manage` alone no longer reveals message attachment metadata.

**Security implications:** The helper is `SECURITY DEFINER`, `STABLE`, with `search_path = pg_catalog, public, auth`; references are schema-qualified. It retains the original revoke from `PUBLIC`/`anon` and authenticated execution grant. New policies use `auth.uid()`, require active membership, and prevent message edits/attachment metadata creation while a participant is blocked. Storage download and upload checks likewise require active status; upload path binds the second segment to the caller. Existing participants can still read messages/attachments while unblocked; confirm the intended semantics after a block. `created_by = auth.uid()` still allows a user to inspect their own media metadata, including their own attachment object key, which is not the other participant's private message body.

**Failure / repeatability:** `CREATE OR REPLACE FUNCTION` is repeatable for the same signature, but every `DROP POLICY` requires the named predecessor policy to exist. This holds after the declared foundation migration sequence; partial/modified schemas may fail. Drops/recreates are transactional under the CLI migration runner but should be exercised on PostgreSQL.

**Corrections / isolated test suitability:** No definite SQL correction found statically. Verify block cases for message update, metadata insert, Storage upload and download; suspension cases; nonparticipant reads; and that content managers cannot enumerate other users' attachment metadata. Suitable for isolated testing after migrations 1–2.

### 4. `20261109000200_support_contact_lookup.sql`

**Dependencies:** `profiles`, `user_roles`, `roles`, `is_active_user()` and `auth.uid()` from the foundation migrations.

**Changes:** Adds `get_support_contact_id()`, returning the earliest-registered active administrator UUID to an active authenticated caller, and explicitly limits execution to `authenticated`.

**Security implications:** The function is `SECURITY DEFINER`, `STABLE`, with fixed `search_path = pg_catalog, public, auth`, and qualifies application/auth objects. It rejects anonymous and suspended callers and returns only a UUID, not profile data. Any active user can discover the chosen support administrator's UUID by design, enabling the existing block-aware direct-conversation RPC. It chooses one support contact deterministically by registration timestamp and UUID; if no active administrator exists it raises `P0002`.

**Failure / repeatability:** `CREATE OR REPLACE`, revoke, and grant are repeatable assuming dependencies and role names exist. Failure conditions include no active user profile, missing roles/tables, or no active administrator (runtime unavailable result, not migration failure).

**Corrections / isolated test suitability:** No source correction established statically. Test active/suspended/anonymous calls, no-admin behavior, selection among multiple admins, and blocked support contact through `create_direct_conversation`. Suitable for isolated testing.

### 5. `20261109000300_conversation_activity.sql`

**Dependencies:** `conversations`, `messages`; trigger privileges from the foundation migration.

**Changes:** Adds a `SECURITY DEFINER` trigger function that updates `conversations.updated_at` on message insert, revokes direct execution, and creates an AFTER INSERT trigger.

**Security implications:** The trigger function uses fixed `search_path = pg_catalog, public`, qualifies names, and cannot be directly executed by client roles. This supports ordering inboxes by recent message activity without exposing extra private data. It fires only on message insertion, not edits/deletes.

**Failure / repeatability:** The function replace is repeatable, but `CREATE TRIGGER message_updates_conversation_activity` is not guarded and fails if this migration is manually rerun or partially applied with the trigger already present. Normal migration history applies it once. The table update depends on trigger-owner privileges/bypass behavior as provided by Supabase migration ownership.

**Corrections / isolated test suitability:** No correction required for a standard one-time migration chain. Test timestamp changes on insert and verify no update on edits if that is intended. Suitable for isolated migration-runner testing; do not promise manual rerun safety.

### 6. `20261109000400_private_inbox_counts.sql`

**Dependencies:** `messages`, `conversation_participants`, `message_read_receipts`, `is_active_user()`, `auth.uid()` and their columns from the foundation migrations.

**Changes:** Adds `get_unread_message_count()` and grants execution only to `authenticated` after revoking `PUBLIC`/`anon`.

**Security implications:** `SECURITY DEFINER` uses fixed `search_path = pg_catalog, public, auth`; it derives the user solely from `auth.uid()`, filters active users and live participation, excludes own/deleted/hidden messages, and excludes messages with that caller's receipt. It returns only an aggregate integer, not row or conversation identifiers. Count accuracy depends on receipt insertion semantics, consistent with the existing self-only receipt insert policy.

**Failure / repeatability:** Create/replace and grants are repeatable if schema dependencies exist. `count(*)::integer` has a theoretical overflow at extremely high unread volume; this is an operational scale limit rather than a practical expected count. Anonymous execution is revoked.

**Corrections / isolated test suitability:** No source correction established statically. Test zero, own-message exclusion, hidden/deleted exclusion, receipt transition, multiple conversations, user isolation, inactive account result, and account reactivation. Suitable for isolated testing.

### 7. `20261109000500_private_realtime_publication.sql`

**Dependencies:** PostgreSQL publication catalogs and the two public tables `messages` and `message_read_receipts`; Supabase Realtime publication conventionally named `supabase_realtime`.

**Changes:** A `DO` block adds those tables to `supabase_realtime` only when that publication exists and only when each table is not already listed.

**Security implications:** Publication membership makes table changes eligible for Realtime delivery; it does not replace RLS or authenticated subscription authorization. The intended privacy boundary remains the active-participant RLS on messages and receipts and must be checked with actual Realtime clients. This migration does not alter table grants or RLS policies. It also silently does nothing if `supabase_realtime` is absent, so migration success alone does not confirm Realtime is enabled.

**Failure / repeatability:** Catalog-guarded and idempotent on repeated execution. It assumes the migration role can alter the publication. A publication that exists but does not permit table additions / a restricted role can fail with a privilege error. `pg_publication_tables` is available on supported PostgreSQL versions.

**Corrections / isolated test suitability:** No correction established statically. Add a schema assertion that both tables are members when Realtime is expected, and verify nonparticipant subscriptions disclose no rows/events using real user JWTs. Suitable for isolated testing; absence of publication should be reported as “Realtime not configured,” not pass.

## Cross-migration findings and required test corrections

1. **Migration ordering is coherent:** all phase 5 references are created in migrations 1–2; subsequent routines/policies are ordered correctly. This is a source dependency review, not PostgreSQL parse proof.
2. **One-time foundation scripts:** migrations 1–2 intentionally create fresh schema objects and are not rerunnable. Apply through the local migration runner against an empty local DB; do not try to apply them to a populated hosted project.
3. **Authenticated user testing is incomplete:** `database_foundation.test.sql` has 12 structural assertions. `rls_isolation.test.sql` has three checks (favorite read, favorite insert, nonparticipant message read) and sets a test JWT claim under `SET ROLE authenticated`; this is useful pgTAP coverage but not a substitute for requests signed by separate Auth users. It does not currently test most of the requested denial matrix.
4. **Existing RLS procedure has useful probes:** `hosted_rls_security_tests.md` documents extensive negative cases and calls out prior block/suspension findings. Update/run it only against the isolated stack, including the new hardening, and record actual results. Do not use its hosted naming as permission to mutate `CINEVA-Development`.
5. **Attachment content safety remains application work:** bucket MIME/type and size filters are not signature validation, malware scanning, or proof of image/PDF safety. The SQL can bind metadata and object path to the sender/conversation but cannot verify actual bytes. Do not enable app upload UI before the authenticated Storage/API behavior tests and safe file validation exist.
6. **Storage path/comment discrepancy:** the foundation SQL comment describes private paths as `<conversation_uuid>/<file>`, while its insert/metadata policies require `<conversation_uuid>/<uploader_uuid>/<object_name>`. The later policies and hosted test procedure use the three-segment form. This is a documentation defect, not a policy change; leave the historical migration intact and keep the three-segment path in application code.
7. **Realtime is a separate test plane:** verify publication membership and actor-specific websocket subscriptions. The pgTAP RLS checks do not test Realtime delivery behavior.

## Per-migration technical verdicts

| Migration | SQL correctness and dependencies | Function permissions | RLS and security | Storage | Realtime | Isolated test suitability |
|---|---|---|---|---|---|---|
| `20261108000100_initial_schema.sql` | Ordered table/FK/trigger setup is coherent by source inspection. Supabase `auth`, `storage`, and `extensions` must exist. One-time bootstrap; not rerunnable. PostgreSQL parse/apply is unverified. | Trigger functions use qualified names/fixed paths; client execution is revoked in migration 2. | RLS/grants are not established until migration 2; do not expose the intermediate schema. | Creates two private buckets and one public artwork bucket with size/MIME allowlists. MIME metadata does not validate file bytes. | No publication changes. | Fresh isolated Supabase DB only, followed immediately by migration 2. |
| `20261108000200_security_and_operations.sql` | Depends on migration 1 and Supabase Auth/Storage roles. Creates policies, RPCs, triggers, grants. Not rerunnable. | Security-definer routines use fixed paths; reviewed named RPCs have explicit grants/revokes. Trigger functions are not client-callable. | Owner/participant policies and report-scoped audited message access are defined. Original message edit/attachment writes lacked consistent block/suspension checks; migration 3 replaces selected policies. | Private attachment object policies are participant/path scoped; active/block tightening is in migration 3. | Does not add tables to Realtime publication. | Isolated stack after migration 1; test RLS as authenticated actors, not owner context. |
| `20261109000100_messaging_security_hardening.sql` | Depends on named helper and four predecessor policies from migration 2. Replacement function syntax is coherent by inspection; predecessor `DROP POLICY` statements intentionally fail on partial schemas. | Replaced helper remains fixed-path security-definer with authenticated-only execute; no new callable entrypoint. | Requires active participation for read helper, writes and attachment Storage reads/uploads; blocks prevent those write paths. | Attachment metadata visibility is narrowed; private object paths remain three segments. | None. | Isolated after migrations 1–2; test block and suspension across table and object APIs. |
| `20261109000200_support_contact_lookup.sql` | Depends on profiles/roles/user roles and active-user helper. Function body and grants are coherent by inspection. | Fixed-path security-definer; `PUBLIC`/`anon` revoked, `authenticated` granted. | Returns only the earliest active administrator UUID to active authenticated callers. | None. | None. | Isolated; test no-admin, suspended, anonymous and blocked support contact. |
| `20261109000300_conversation_activity.sql` | Depends on messages/conversations. Trigger statement is coherent; CREATE TRIGGER is not rerunnable. | Fixed-path security-definer trigger function; direct client execution revoked. | Updates conversation ordering on message insert; does not grant table access. | None. | None. | Isolated migration-runner application; verify insert ordering and one-time trigger creation. |
| `20261109000400_private_inbox_counts.sql` | Depends on messages/participants/receipts and auth helpers. Aggregate query is coherent by inspection; integer count has theoretical overflow. | Fixed-path security-definer; `PUBLIC`/`anon` revoked, `authenticated` granted. | Uses `auth.uid()`, active status, live membership and caller-specific receipts; emits only count. | None. | None. | Isolated; verify receipt transitions and cross-user counts. |
| `20261109000500_private_realtime_publication.sql` | Depends on PostgreSQL publication catalogs and tables. Idempotent if publication exists; silently skips if absent. | No function or grants changed. Requires migration role to alter publication. | RLS remains the intended row privacy boundary; publication membership alone does not prove websocket authorization. | None. | Adds messages and receipts to `supabase_realtime` when present. | Isolated; assert publication membership and test participant/nonparticipant websocket sessions. |
| `20261110000100_private_activity_write_guards.sql` | New forward migration depends on migrations 1–2. Replaces permissive owner-all policies with explicit read/insert/update/delete rules; PostgreSQL parse/apply unverified. | Uses existing `is_active_user()` helper; no new function or execution grant. | Requires active account for favorites/history writes and published content for favorite/history insert or history update. Owner reads remain private; active owners can delete stale activity. | None. | None. | Suitable for disposable local migration runner; pgTAP cases added for draft rejection, published history, and suspended favorite rejection. Not executed. |
| `20261110000200_profile_display_name_provisioning.sql` | Replaces existing auth trigger function; depends on `auth.users.raw_user_meta_data`, profiles, roles and the existing trigger. Body is coherent by inspection; PostgreSQL parse/apply unverified. | `CREATE OR REPLACE` preserves the existing trigger attachment and ACL; retains fixed `pg_catalog, public` path and security-definer setting. Function remains trigger-only under existing revoked client execution. | Copies only trimmed, nonempty Auth display name, caps at 80 chars, and does not update an existing profile on conflict. | None. | None. | Suitable for isolated test; pgTAP assertion added for a new profile. Not executed. |
| `20261110000300_message_recipient_discovery.sql` | Depends on profiles, active-user and block helpers from migrations 1–2. Function is read-only and fixed-path; SQL parse/apply unverified. | `SECURITY DEFINER`, explicit `pg_catalog, public, auth` path, `PUBLIC`/`anon` revoked, `authenticated` granted. | Requires active caller, 2–80 character search, excludes self/inactive/blocked users, returns only IDs/names, caps results at 20. It exposes matching active display names and IDs by design; abuse-rate limiting remains an operational control to add before high-scale use. | None. | None. | Suitable for isolated tests; recipient discovery assertion prepared but not executed. |

## Corrections implemented after the initial review

- Added `20261110000100_private_activity_write_guards.sql`. The original `favorites_owner_all` and `watch_history_owner_all` policies allowed user-owned writes without checking account status or publication status. The new policies require active accounts for mutations and published parent content for new favorites/history and history updates.
- Added `20261110000200_profile_display_name_provisioning.sql`. The prior auth trigger provisioned a profile without copying signup's display-name metadata. The replacement trims and caps metadata for new profiles only and leaves existing profiles untouched.
- Added `20261110000300_message_recipient_discovery.sql` and replaced the inbox UUID entry with display-name search and selection. The RPC excludes self, inactive users and blocked users and exposes no email or other profile fields.
- Extended `supabase/tests/rls_isolation.test.sql` with a draft-history rejection, published-history success, suspended-user favorite rejection, profile display-name provisioning, and recipient discovery filtering. The test now plans 8 assertions.
- These are source-level corrections only. Migration application and the expanded pgTAP suite remain unexecuted; no hosted database was contacted.

## Required isolated test matrix before treating this security model as verified

Use distinct synthetic User A, User B, administrator, and suspended-user identities, plus a moderator with and without `messages.moderate`. Run requests with their own authenticated sessions and separately test anonymous access. Include:

- private profile read/update and role/administrator visibility;
- favorites/history isolation and insert/update ownership;
- participant/nonparticipant conversation, message, attachment metadata, receipt and unread-count access;
- sender impersonation, forged receipt, block and suspension checks for read/write/edit/delete paths;
- Storage upload/download/path guessing, bucket privacy, ownership and oversized/disallowed file rejection;
- report-scoped audited moderator RPC versus ordinary admin direct message SELECT;
- support contact lookup and direct user/admin conversations;
- Realtime messages/receipts under participant and nonparticipant JWTs;
- published/draft/archived catalogue boundaries and invalid/unpublished playback-history targets.

The identities should be provisioned only in the confirmed disposable local stack. Do not create accounts, send email, or touch real users for this static review.

## Actual execution results

- Migration SQL parse/apply: **not run** (no confirmed working Docker/local Supabase CLI stack).
- `supabase test db` / pgTAP: **not run**.
- Authenticated API/RLS/Storage/Realtime behavior tests: **not run**.
- Hosted schema check: **not run**.
- Hosted `CINEVA-Development` database: **not contacted or modified**.
