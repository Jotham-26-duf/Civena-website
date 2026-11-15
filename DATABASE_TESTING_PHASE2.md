# CINEVA Database Testing — Phase 2

## Scope and status

The repository was reviewed against the two supplied migrations, both existing pgTAP files, generated `src/lib/database.types.ts`, and the database architecture, security, relationship, setup, migration, and testing documentation. This work did not connect to the hosted project. No hosted check or RLS test has passed yet. The migrations and generated types are source artifacts; types do not prove the live database matches them.

The hosted, read-only metadata checker is [`supabase/tests/hosted_schema_checks.sql`](supabase/tests/hosted_schema_checks.sql). It inspects the current database catalogs and reports PASS, FAIL, WARNING, and INFO rows. It neither alters database objects nor reads application rows.

## Expected hosted schema

The initial migration defines 39 tables in `public`, spanning catalogue and media (`content_items`, `movies`, `series`, parts/seasons/episodes, genres, assets, sources and links), identity and permissions, user activity and reviews, messaging, notifications, moderation, and audit. The security migration enables RLS across all 39.

Expected structural features include:

- Primary, foreign, unique, and check constraints for content subtypes and their child relationships; scoped slugs and legacy IDs; positive part/season/episode numbers; one-target-only media sources and watch-history rows; owner-scoped list/rating uniqueness; and canonical direct conversation pairs.
- Search, catalogue, child-ordering, unread-notification, report, messaging, and audit indexes, including partial uniqueness indexes for history, default watchlists, and direct conversations.
- Security, authorization, provisioning, notification, moderation, subtype-integrity, and audit functions with associated triggers.
- Three storage buckets: `public-artwork`, `profile-images`, and `private-message-attachments`, with bucket-specific storage policies.
- Messaging relationships: conversations to participants, messages, attachments, read receipts, blocks, and reports; messages link to sender and conversation; attachments link to messages and media assets.

The SQL checker lists actual constraints, policies with commands and roles, functions, and triggers. Its expected-object comparisons are intentionally a focused baseline; it is not a full semantic diff of every policy expression or every constraint definition. Read any WARNING as requiring review; an extra `public` table may be intentional in a managed project.

## How to run the hosted schema check

1. Open Supabase Dashboard and select project `CINEVA-Development` (reference `cqyuotkxfjficjhhjepg`). Confirm the project name/reference in the dashboard before continuing.
2. Open **SQL Editor**, create a new query, and paste the entire contents of [`supabase/tests/hosted_schema_checks.sql`](supabase/tests/hosted_schema_checks.sql).
3. Run it once. Review the results grid and save/export the result if you need an audit record.
4. Treat any `FAIL` as a mismatch or an inspection privilege issue to investigate. Review `WARNING` entries, especially unexpected public tables. `PASS` confirms only the particular catalog-level presence/count check. `INFO` rows describe objects found; they do not certify their correctness.

The query is read-only and uses catalog views (`pg_catalog`, `pg_policies`, and Storage metadata). It checks schema metadata, not application row contents. If the SQL Editor reports permission denied on `storage` metadata, record that as an inspection limitation and have a project owner run the same query; do not change grants to make the check work.

## Existing SQL tests and requirements

### `database_foundation.test.sql`

This test uses pgTAP (`plan`, `has_table`, `ok`, `has_index`, `finish`) and wraps assertions in a transaction ending in `ROLLBACK`. It checks selected tables and four broad structure assertions, including a hard-coded count of 39 RLS-enabled public tables. It is intended for `supabase test db` in a local Supabase test environment with pgTAP installed, or another explicitly configured pgTAP runner. It is not a plain SQL Editor script because pgTAP functions may not be installed/exposed in hosted SQL Editor contexts. Running this test as a database owner also only inspects structure; it does not test user RLS behavior.

### `rls_isolation.test.sql`

This test also uses pgTAP and a transaction/rollback. It directly inserts three synthetic records into `auth.users` plus fixture content, favorites, a conversation, participants, and a message. Then it uses `SET LOCAL ROLE authenticated` and `request.jwt.claim.sub` to simulate users A and C and checks a cross-owner favorite read/write and nonparticipant message read.

It requires pgTAP, elevated ability to seed `auth.users` and application tables, and the ability to switch role / set JWT claims in the same transaction. The fixtures are fake, but running it on a hosted database can conflict with existing deterministic IDs or email addresses and depends on hosted auth trigger behavior. It is therefore not safe to run as-is in the populated hosted project. It tests only three negative cases and does not cover attachments, receipts, Storage, moderator access, administrator access, positive access, or all cross-user operations.

The Dashboard SQL Editor normally executes with a privileged database role; simply running a query there does not prove what anon/authenticated users can see. Do not use a database-owner session as evidence of RLS isolation.

## Hosted-compatible security test procedure

Run behavioral security tests against a disposable Supabase project first. If hosted testing is required, use a separately authorized, isolated test project and dedicated synthetic Auth users. Do not insert fake identities or fixture messages into a project containing real application data.

1. Create dedicated synthetic accounts through Supabase Auth for anonymous, User A, User B, moderator without `messages.moderate`, moderator with that permission, and administrator. Grant roles through the reviewed protected provisioning path; do not self-promote or edit role tables through a browser client.
2. Use the public client key with each user's valid JWT in separate REST/API requests. Keep each actor in a distinct client/session. Do not rely on SQL Editor's owner context, and never expose a secret/service-role key to the client.
3. Create disposable fixture records only in the disposable project using authenticated application flows or a reviewed fixture script. Record the fixture IDs and clean them up only within that disposable environment.
4. Verify allowed access for each owner and denied cross-user operations for profiles, preferences, favorites, watchlists/items, watch history, ratings, notifications, and private messaging. Check both row reads and attempted writes/updates/deletes; an empty SELECT alone does not prove write isolation.
5. For messaging, create User A↔User B and User A↔administrator conversations using the direct-conversation RPC. Check nonparticipant cannot enumerate conversations, read messages, see attachment metadata/object bytes, or read receipts. Check participant can do intended operations, sender identity cannot be forged, a blocked pair cannot send, and a nonparticipant cannot report an arbitrary message.
6. Test moderator without `messages.moderate` is denied the exceptional RPC. Test authorized moderator can retrieve only a message with an open/reviewing report, and confirm an `admin_audit_log` row is recorded for each successful retrieval. Test an administrator without the named permission has no blanket message read; verify an administrator with the permission still must use the report-scoped audited function.
7. Test bucket object paths across users/conversations for read, upload, and delete. Confirm profile-image owner folder isolation and private-message attachment participant scope.
8. Exercise anonymous access to draft/archived catalogue, inactive/private source rows, unpublished announcements, and private user data; verify they remain inaccessible.
9. Capture request outcomes and audit-row evidence without retaining message bodies or secrets. Remove only the disposable fixture data in the disposable project.

These live tests require multiple authenticated identities and API sessions, which the SQL Editor alone cannot emulate safely or credibly. Use Dashboard Auth plus REST/API tooling or an application test harness against the disposable project. The existing pgTAP test does not substitute for this matrix.

## Private messaging security review

The migrations define direct and group conversation types, though the creation RPC implements direct conversations only. A direct pair must be canonical (`low < high`) and unique; deferred constraint triggers require exactly the two designated active participants. The RPC requires an active signed-in user and target, rejects self-messaging and blocked pairs, canonicalizes the pair, then adds both participants.

Conversation, message, attachment metadata, and receipt SELECT policies use active participant membership. Direct client grants allow selecting participant rows but do not grant inserting, updating, or deleting them. Message writes require the current user's sender ID and active participation; attachment metadata writes require the user's own sent message and an owned message-attachment asset in the expected bucket/path. Storage message-attachment reads/uploads are participant scoped by conversation path, and deletion is limited to the sender. These are static findings from the migration; the hosted role grants/policies and effective behavior have not been exercised.

No administrator role is hard-coded into the message SELECT policy. The exceptional `get_reported_message_for_moderation` SECURITY DEFINER function requires `messages.moderate`, only returns a message tied to an open/reviewing message report, and inserts an audit-log row before returning it. That meets the migration's intended audited, report-scoped moderator access design by inspection. Verify the live function definition, grants, permissions, report scoping, and resulting audit rows using the hosted schema check plus the role-based procedure above.

## Defects and limitations found

- No hosted database tests were run. This workspace has no configured database connection or test credentials; applying the migrations does not establish that live objects match them.
- The current foundation pgTAP test covers only a small structural subset and assumes exactly 39 public RLS-enabled tables. Managed or intentionally added tables can make its count brittle.
- The current RLS pgTAP test writes deterministic fake auth/user/application rows and covers only a few negative cases. Do not run it unchanged against the hosted development project if it contains data.
- There is no SQL Editor-only way to credibly emulate multiple authenticated users and verify Storage object access. That testing requires isolated test identities and separate API sessions.
- The checker verifies presence and reports policy commands/roles, but catalog presence cannot prove policy expressions are semantically correct, that role grants are as intended, or that objects are usable under the actual API JWT roles. Compare definitions against migrations and run the behavioral matrix.
- No concrete exploitable messaging bypass was identified by static inspection: client table grants omit participant writes, and the audited exceptional read is report-scoped. This is not a live security assurance.
- Group conversations are represented in the schema but no group-creation workflow is implemented by the migrations; treat group messaging as unimplemented until a separately reviewed design and behavior test exist.

## Static checks performed

Static checks should verify that the new files exist, the SQL contains no data-changing statements, and each required expected object family is represented. The results of the actual static checks run for this phase are reported in the handoff response. No hosted database test is implied by those checks.
