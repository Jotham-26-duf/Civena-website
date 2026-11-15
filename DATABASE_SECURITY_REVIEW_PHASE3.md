# CINEVA Database Security Review — Phase 3

## Scope and evidence

Reviewed both database migrations in full, with emphasis on RLS policy expressions and `WITH CHECK` clauses, grants, Storage policies, SECURITY DEFINER functions and execution grants, function `search_path` settings, and triggers for auth provisioning, conversations, notifications, role changes, and auditing. Also considered the hosted schema inspection results supplied in the request.

No connection was made to project `cqyuotkxfjficjhhjepg`. No API request, JWT-based behavioral test, or SQL against the hosted database was run. The supplied result establishes metadata presence only: 39/39 expected tables, RLS on 39/39, 3/3 buckets, and 4/4 schemas; it does not prove that policies behave correctly for anon/authenticated JWTs.

No CRITICAL or HIGH issue was identified in the static review. The MEDIUM and LOW findings below still require resolution or an explicit product decision, and all behavioral controls remain NEEDS LIVE TEST.

The detailed, isolated-project test procedure is [`supabase/tests/hosted_rls_security_tests.md`](supabase/tests/hosted_rls_security_tests.md). It uses separate JWT-backed actors, covers the ten requested attack scenarios, adds attachment metadata scope testing, and documents safe fixture cleanup. It explicitly avoids owner-context SQL as proof of RLS behavior.

## Findings

### MEDIUM — Blocking does not prevent edits or attachment writes in an existing conversation

**Affected policies:** `messages_sender_update`, `attachments_sender_insert`, `message_attachment_participant_insert` on `storage.objects`.

**Attack:** After B blocks A, A's new direct-conversation creation and new `messages` inserts are denied by `create_direct_conversation` and `messages_active_sender_insert`. The existing message update policy only checks that A is the sender and is an active conversation participant. The message attachment metadata insert policy checks sender/message/asset ownership and path but not `is_blocked_between`. The Storage attachment insert policy checks participant membership and uploader path but not blocking. A can therefore be able to edit an old message and add/upload an attachment to it after the block. Similarly, `set_account_status` marks a profile suspended, but conversation/message/attachment reads use participant membership without checking `is_active_user()`; a still-valid suspended user's JWT appears able to retain historical private reads. Old-message edits and attachment writes also lack a consistent active-account check.

**Recommendation:** Decide whether a block must stop all further content changes. If so, add consistent active-account and symmetric block checks to message update, attachment metadata insert, and private attachment object upload policies. Test both block directions. This review did not change policies.

**Status:** Static policy review indicates the path is allowed when the other checks pass; reproduction remains **NEEDS LIVE TEST** in an isolated project.

### MEDIUM — Content managers can read private-message attachment metadata

**Affected table/policy:** `public.media_assets`, policy `public_content_artwork_read`.

**Attack:** The SELECT expression contains `or public.has_permission('content.manage')` without restricting `asset_type`. The seeded administrator role has `content.manage`. A nonparticipant administrator can therefore read `media_assets` rows for `message_attachment` assets, including uploader IDs, bucket, object key, MIME metadata, and other columns. The private Storage object policy still requires conversation participation, so this does not grant message-body access or attachment bytes. It does disclose conversation/object metadata without the audited moderation RPC.

**Recommendation:** Restrict the content-management read condition to catalogue/profile asset types and provide a separate participant-scoped path for message attachment metadata. If administrators are intentionally allowed to see these metadata, document that exception and test it explicitly; do not describe administrator access as limited to audited reads without that qualification.

**Status:** The migration expression statically permits this SELECT; validate against the hosted grants and decide whether the exposure is acceptable.

### LOW — Signed Storage URLs are transferable bearer access

**Affected surface:** Private buckets and any application/API that issues signed URLs.

**Attack:** The Storage RLS rules guard authenticated object requests. A valid signed URL is a bearer capability; a nonparticipant who receives one can use it until it expires even though their JWT would fail the participant policy.

**Recommendation:** Mint signed URLs only after an authenticated membership check, use short expiry, avoid logging or sharing them, and test authenticated downloads separately from URL possession. If access must be revocable and tied to the current JWT/participant state, serve downloads through an authenticated proxy instead of transferable signed URLs.

**Status:** Supabase signed URL behavior and the CINEVA URL-minting path were not exercised; **NEEDS LIVE TEST** and application-route review.

### LOW — Group conversation type has no supported creation workflow

**Affected schema/function:** `conversations.conversation_type` supports `group`, but `create_direct_conversation` only creates direct pairs and deferred participant integrity checks apply only to direct conversations.

**Impact:** This is a product completeness limitation rather than a demonstrated RLS bypass. Avoid creating group rows through an owner context or unsupported client path; there is no tested group participant-management flow.

**Recommendation:** Keep group messaging out of the supported API until a separately reviewed creation, membership, leave/remove, and RLS design is implemented and tested.

## Static security review: positive controls

### PASS — Participant membership cannot be written by ordinary authenticated clients

The migration revokes all public/authenticated table privileges, then grants `SELECT` on `conversations` and `conversation_participants`, but no client INSERT/UPDATE/DELETE on participant rows. `create_direct_conversation(uuid)` is SECURITY DEFINER, requires a non-null active caller and active target, disallows self-messaging and blocked pairs, canonicalizes the pair, and inserts both members. Deferred constraint triggers require a direct conversation to have exactly its two designated active participants. Test direct API writes anyway, because the hosted grants are not live-verified here.

### PASS — New message sender and participant checks are present

`messages_active_sender_insert` WITH CHECK binds `sender_id` to `auth.uid()`, requires `is_active_user()`, requires active conversation participation, and refuses a blocked pair. The authenticated grant allows message INSERT, but UPDATE is column-limited to `body`, `edited_at`, and `deleted_at`; `sender_id` and `conversation_id` cannot be altered through the ordinary table API. The update policy's USING condition also requires message ownership and active membership.

### PASS — Ordinary message and attachment reads are participant scoped in the migration

Conversation/message SELECT expressions call `is_conversation_participant`. Attachment metadata and read receipt SELECT policies join through messages and require participant status. The helper is SECURITY DEFINER, `STABLE`, uses `search_path = pg_catalog, public, auth`, and returns whether `auth.uid()` has an active participant row. These controls need actual JWT/session tests.

### PASS — Read receipt identity and write privileges are narrow

Authenticated clients receive SELECT and INSERT for `message_read_receipts`, not UPDATE/DELETE. The insert policy requires `user_id = auth.uid()` and participation in the message conversation. Validate that a REST update is rejected and cross-conversation inserts fail.

### PASS — Direct message reads are not granted to moderators/admins by role alone

The `messages_participant_read` policy has no permission-based branch. The exceptional `get_reported_message_for_moderation(uuid)` RPC checks `messages.moderate`, requires an open/reviewing report for that message, inserts an `admin_audit_log` row, then returns selected message fields. Its execution is revoked from PUBLIC/anon and granted to authenticated users. `moderate_content` also requires the named permission and only changes a message while it has an open/reviewing report; it writes a moderation action whose trigger creates an admin audit record.

The seeded standard `moderator` role receives `reports.review` and `comments.moderate`, but not `messages.moderate`. The seeded `administrator` role receives all seeded permissions. Therefore the no-permission moderator should be denied; an explicitly authorized moderator may use the report-scoped audited RPC. Direct message SELECT remains participant-only even for an administrator. This is static review, not behavior-test evidence.

### PASS — Self-promotion is guarded in the migration

There are no authenticated INSERT/UPDATE/DELETE grants for `user_roles` or `role_permissions`; authenticated users have SELECT only. `set_user_role` and `set_role_permission` are SECURITY DEFINER, use constrained search paths, and require `has_permission('users.manage')`. `set_user_role` validates allowed roles and protects the final active administrator from removal. Role and role-permission changes have audit triggers. Test the direct table path and both RPCs as standard user A.

### PASS — SECURITY DEFINER setup

Reviewed SECURITY DEFINER functions: `has_permission`, `is_active_user`, `is_conversation_participant`, `is_blocked_between`, `provision_profile`, `create_direct_conversation`, notification trigger functions, `get_reported_message_for_moderation`, `moderate_content`, `set_user_role`, `set_role_permission`, `set_account_status`, and `write_admin_audit`. Each has a fixed `search_path` declaration. Callable privileged functions revoke default PUBLIC/anon execution and then grant the intended role; trigger functions are revoked from client roles where appropriate. The database-owner view of effective ownership, grants, and function definitions still needs confirmation through hosted metadata inspection.

### PASS — Private Storage objects are not public buckets by the migration definition

The migration creates `private-message-attachments` and `profile-images` with `public=false`. Message object reads and uploads require active membership by conversation path; upload path also binds the second path segment to `auth.uid()`. Deletion of message objects is limited to the uploader and a message authored in that conversation. Profile object paths bind the first segment to the caller. A signed URL remains transferable as described above.

## Requested attack matrix

| Scenario | Static expectation | Review status |
|---|---|---|
| A reads B's conversation | No participant row means RLS returns no row/denies | NEEDS LIVE TEST |
| A reads messages in a nonparticipant conversation | Participant-only message SELECT | NEEDS LIVE TEST |
| A inserts self into another conversation | No participant INSERT grant | NEEDS LIVE TEST |
| A sends with B's sender ID | Message INSERT WITH CHECK requires `auth.uid()` | NEEDS LIVE TEST |
| A uploads/retrieves another conversation's attachment | Storage and attachment metadata require membership | NEEDS LIVE TEST; signed URLs are a bearer exception |
| A creates/modifies another user's read receipt | insert requires self and membership; UPDATE grant absent | NEEDS LIVE TEST |
| Blocked user sends a new message | new message insert and direct-conversation RPC check symmetric block | NEEDS LIVE TEST; old-message edit/attachment gap is MEDIUM |
| Ordinary user calls moderator/role functions | permission checks should raise 42501 | NEEDS LIVE TEST |
| User assigns self administrator | no role table write grant; RPC requires `users.manage` | NEEDS LIVE TEST |
| Moderator reads unreported message | no direct message SELECT; RPC requires permission and open report | NEEDS LIVE TEST |
| Suspended user retains messaging access | reads check membership; some writes also omit active-account check | NEEDS LIVE TEST; likely gap if suspension is meant to revoke private access |

## Exact next actions

1. Use the local procedure in [`supabase/tests/hosted_rls_security_tests.md`](supabase/tests/hosted_rls_security_tests.md) to run the behavioral matrix against an isolated disposable project, not the populated CINEVA-Development project.
2. Use actual synthetic-user JWTs in separate API sessions; retain only redacted outcomes and fixture IDs.
3. Reproduce the post-block edit and attachment operations and confirm `media_assets` metadata behavior for a nonparticipant administrator.
4. Verify successful `M1` report-scoped access adds exactly one matching audit row, while M0 denied calls and unreported-message calls add none.
5. Review the two MEDIUM findings and decide on separate migration changes only after this report and isolated test results are reviewed. Do not change live policies during testing.
6. If tests later run in CINEVA-Development, first establish a dedicated isolated test namespace/project and authorization for synthetic account/data creation. No hosted fixture setup is authorized by this review.

## Local static checks

The actual static check results for the two new Markdown files are reported in the handoff response. No migrations, database policies, hosted data, or application source files were changed. No security test has been claimed as passed.
