# Hosted RLS Security Test Procedure

## Safety and scope

Run these behavioral tests against an isolated disposable Supabase project built from the reviewed migrations. Do not run fixture creation or mutation requests against `CINEVA-Development`: this review was not authorized to add hosted test rows, and real JWT behavior cannot be established by running owner-context SQL Editor queries. Use only synthetic accounts and objects in the isolated project. Preserve the project reference and schema-check output as test evidence; do not store credentials, JWTs, signed URLs, or message bodies in the report.

The procedure uses authenticated API sessions with actual user JWTs. Use a local API client with separate environments for each actor or separate browser profiles logged in as each synthetic account. Use the project publishable/anon key only as the `apikey`; never use a secret/service-role key. Keep each actor's access token in a local secret variable or password manager, do not put tokens in shell history, screenshots, source control, or shared logs, and do not paste them into chat.

Example request shape (replace variables inside your local API client; do not publish resolved headers):

```http
apikey: <project publishable key>
Authorization: Bearer <that synthetic user's access JWT>
Content-Type: application/json
```

Use the Supabase Auth sign-in flow for each test account to obtain its JWT. A valid JWT for account A must be used only in A's session, and likewise for B, C, the moderator, and the administrator. Verify each session's identity before every test. Never simulate `auth.uid()` by setting a SQL claim in SQL Editor; that is not a substitute for API requests carrying signed user JWTs.

## Actors and fixture records

Create these accounts in the isolated project only:

| Actor | Initial role / purpose |
|---|---|
| A | Standard active user; conversation creator and attacker in most negative tests |
| B | Standard active user; A's direct conversation partner and message sender |
| C | Standard active user; nonparticipant |
| M0 | Standard `moderator` role with the migration's default grants (`reports.review`, `comments.moderate`; no `messages.moderate`) |
| M1 | Synthetic `moderator` with `messages.moderate` explicitly granted by the isolated project's authorized test administrator |
| ADM | Synthetic active administrator with the seeded permissions |

The migration's default moderator role is not granted `messages.moderate`; do not change role permissions in CINEVA-Development for this test. In the isolated project, provision M1 using the protected administration path and record the permission grant as test setup. Bootstrap an isolated test administrator through the project's approved operator process, not by weakening RLS or using owner-context requests as behavioral evidence.

Using A's authenticated session, call `POST /rest/v1/rpc/create_direct_conversation` with `{"target_user_id":"<B user UUID>"}` and again with ADM's UUID. Save the returned conversation IDs as `CONV_AB` and `CONV_AADM`. Using B, create a direct conversation with C and save its ID as `CONV_BC`. Create one message in each conversation through the authenticated API; save `MSG_AB` (sent by B), `MSG_AADM`, and `MSG_BC`. Use harmless test text. Do not create these fixtures in the hosted CINEVA-Development project.

For the attachment cases, upload a small allowed test image to `private-message-attachments/<CONV_BC>/<B UUID>/<filename>` as B, and create the corresponding `media_assets` metadata and `message_attachments` association through B's authenticated session. Keep a second allowed image and `CONV_AB` available to test successful participant access. Storage uploads use `POST /storage/v1/object/<bucket>/<object path>`; metadata and association rows use `POST /rest/v1/media_assets` and `POST /rest/v1/message_attachments`. Use a supported image MIME type and valid small test bytes.

## Running each test

For PostgREST requests, query the indicated table with `select` fields only. A denied row-level SELECT commonly returns HTTP 200 with `[]`; that means no rows were visible, not an error. For denied writes, accept a permission/RLS denial (normally HTTP 401/403 with SQLSTATE `42501`). Record HTTP status, response error code, and whether a row/object was created. Do not treat a request as denied just because the client UI hid it.

| # | Actor and request | Expected outcome |
|---|---|---|
| 1. Read another user's conversation | A: `GET /rest/v1/conversations?id=eq.<CONV_BC>&select=id` | Denied by RLS: 200 with no rows, or an authorization error. B and C each can read their own `CONV_BC` row. |
| 2. Read nonparticipant messages | A: `GET /rest/v1/messages?conversation_id=eq.<CONV_BC>&select=id,conversation_id,sender_id` | Denied by RLS: 200 with no rows, or an authorization error. B and C can read the fixture message. |
| 3. Add self as a participant | A: `POST /rest/v1/conversation_participants` with `{"conversation_id":"<CONV_BC>","user_id":"<A UUID>"}` | Denied by table privileges (no client INSERT grant), regardless of participant RLS. Confirm no row exists. |
| 4. Impersonate a sender | A: `POST /rest/v1/messages` with `{"conversation_id":"<CONV_AB>","sender_id":"<B UUID>","body":"impersonation probe"}` | Denied by `messages_active_sender_insert` WITH CHECK because sender must equal `auth.uid()`. Confirm no message exists. A may send as A in `CONV_AB`. |
| 5. Cross-conversation attachment upload/read | A: try upload under `private-message-attachments/<CONV_BC>/<A UUID>/probe.png`; then try authenticated download of B's `<CONV_BC>` object. Also try selecting B's attachment metadata by ID. | Upload denied because A is not a participant in `CONV_BC`. Download and metadata read denied; do not receive object bytes or rows. B and C may access the object through their authenticated sessions because they are active participants. |
| 6. Forge or modify read receipts | A: `POST /rest/v1/message_read_receipts` for `MSG_AB` with `user_id=<B UUID>`; then try inserting for A on `MSG_BC`. Also try `PATCH /rest/v1/message_read_receipts?message_id=eq.<MSG_AB>&user_id=eq.<A UUID>` with a changed `read_at`. | First insert denied because `user_id` must equal `auth.uid()`. Second denied because A is not a conversation participant. UPDATE is not granted to authenticated clients and must fail. A may insert A's receipt for a message in `CONV_AB`. |
| 7. Blocked sender | B: `POST /rest/v1/message_blocks` with `{"blocker_id":"<B UUID>","blocked_id":"<A UUID>"}`. Then A: attempt to create a direct conversation with B and attempt `POST /rest/v1/messages` into `CONV_AB`. | Both new-conversation and new-message attempts should be denied. The block function checks either direction. **Also run the follow-up probes below:** the current migration appears to allow A to edit A's old message and attach a new attachment to it after the block; those operations are a known static gap and are expected to succeed until policy changes are reviewed. |
| 8. Ordinary-user moderator function access | A: `POST /rest/v1/rpc/get_reported_message_for_moderation` with `{"target_message_id":"<MSG_AB>"}`; then `POST /rest/v1/rpc/set_user_role` with a target user and `administrator`. | Both denied with permission error (SQLSTATE `42501`). A has neither `messages.moderate` nor `users.manage`. Confirm no audit row or role change. |
| 9. Self-assignment to administrator | A: direct `POST /rest/v1/user_roles` for A and the administrator role; also call `set_user_role` as A. | Direct write denied by table privileges/RLS. RPC call denied by `has_permission('users.manage')`. A remains a standard user. |
| 10. Authorized moderator, unreported message | M1: call `get_reported_message_for_moderation` with `MSG_AB` before it has a report. Separately, M0 calls the same RPC. | M1 has the permission but must receive “reported message not found” (SQLSTATE `P0002`) and no audit record for the failed access. M0 must receive permission denied (`42501`) before any message lookup. Neither can SELECT `MSG_AB` directly as a nonparticipant. |
| 11. Report-scoped audited access | B: insert an open report for `MSG_AB` using `POST /rest/v1/message_reports` with `reporter_id=<B UUID>`, message ID, and a synthetic reason. M1: call the moderation RPC for `MSG_AB`. ADM (or an actor with `audit.read` in the isolated setup): query audit log for `entity_type='message'`, `entity_id=MSG_AB`, `action='message.moderation_read'`, and `actor_id=M1`. | Report insertion by a participant is allowed. M1 gets the message JSON only through the RPC. Exactly one matching audit event should exist for the successful read. No body or secrets should be copied into retained test evidence. A direct `GET /rest/v1/messages?id=eq.<MSG_AB>` by M1 while nonparticipant remains empty/denied. |
| 12. User-to-admin conversation | A calls direct-conversation RPC for ADM, sends a message as A, and ADM reads it. C reads `CONV_AADM` and its messages. Also have ADM request `GET /rest/v1/messages?conversation_id=eq.<CONV_BC>&select=id`. | A and ADM can read the conversation and message as participants. C cannot. ADM's read of nonparticipant `CONV_BC` must return no rows or be denied; administrator role alone must not grant broad message SELECT. |
| 13. Admin attachment metadata scope | ADM (not a participant in `CONV_BC`): `GET /rest/v1/media_assets?asset_type=eq.message_attachment&select=id,created_by,bucket,object_key` and authenticated Storage download of B's object. | The Storage download should be denied. **The media metadata query is expected to return rows under the current policy:** `public_content_artwork_read` includes `public.has_permission('content.manage')`, and seeded administrators have that permission. This exposes attachment metadata (including object keys) but does not grant message-body or object-byte access. Treat this as a finding and verify whether metadata visibility is intended. |
| 14. Suspension and existing conversations | ADM calls `set_account_status` to suspend synthetic A in the isolated project. With A's still-valid JWT, try reading `CONV_AB`, its messages, and an attachment; then try message edit, attachment metadata insert, and Storage upload. | **Current policy expressions appear to continue allowing reads** because participant checks do not require `is_active_user()`. New message INSERT is denied, but old message edits and attachment writes also lack a consistent active-account check. Decide whether suspension should revoke historical private access; if yes, these operations should be denied after correction. |

### Block follow-up probes and file capability caveat

Run these after test 7 in the isolated project:

1. A PATCHes A's own existing message `body` in `CONV_AB` after B blocks A. The current `messages_sender_update` policy checks sender ownership and active membership but not `is_active_user()` or `is_blocked_between()`. The column grant permits the body edit. Static review therefore predicts it will succeed.
2. A tries adding an attachment metadata row referencing A's old message and an A-owned attachment asset under the expected `CONV_AB/A` path after B blocks A. `attachments_sender_insert` checks message ownership, non-deletion, asset owner, bucket, and path, but does not check the block. Static review predicts it will succeed.
3. A tries Storage upload into `CONV_AB/A` after B blocks A. The storage INSERT policy checks active conversation membership and uploader path, but does not check active account status or blocks. Static review predicts it will succeed.

These are not expected denials under the present SQL: they are reproduction probes for the MEDIUM finding in the phase 3 report. Keep them isolated and capture outcomes. A correction should be separately reviewed to make editing/attachment writes consistent with the intended block and account-status rules.

Private Storage authorization applies to authenticated object requests. A signed URL is a bearer capability: anyone holding a valid, unexpired URL can use it. Do not share signed URLs during tests. Verify nonparticipants cannot request their own signed URL or download through an authenticated Storage request. If the application mints signed URLs, separately audit the minting route for membership checks, short expiry, and safe logging; strict revocation requires avoiding transferable signed URLs or using an authenticated proxy.

## Session separation and evidence

Use a separate local API client environment or browser profile for each user. Select the actor's project and user session before sending a request, and include only that actor's JWT. Never switch an account identity by changing a request body; `auth.uid()` is derived from the JWT. Capture endpoint, actor label, status/error code, row count, and fixture ID. Redact Authorization headers, passwords, JWTs, signed URLs, private message text, and email addresses in all saved evidence.

An SQL Editor query executed as `postgres`, `service_role`, or another owner-like role is not an RLS isolation test. SQL Editor may be used after the API tests to inspect the disposable fixture and audit result, but that inspection is supporting evidence only. Prefer reading the expected audit row through an authenticated account granted `audit.read` in the isolated setup.

## Cleanup

Clean up only in the disposable project, while signed in as the fixture owner or using the isolated project's approved test cleanup process:

1. Delete test Storage objects from all three test paths, including private-message attachment images. Confirm no signed test URLs remain active or wait for their short expiry.
2. Remove test message reports and messages/conversations through the approved fixture cleanup path. Conversation deletion cascades to participant rows, messages, metadata, receipts, and reports; this is destructive and must be limited to saved fixture IDs in the isolated project.
3. Delete test content and other fixture rows created solely for this procedure, then delete synthetic Auth accounts through the Dashboard Auth users page.
4. Remove any test-only role assignment and test-only `messages.moderate` permission assignment in the isolated project. Verify no fixture account or role permission remains.
5. Do not execute cleanup statements from SQL Editor against the CINEVA-Development project. Do not delete audit records generated by a test; preserve them with the test evidence, then discard the isolated project according to its retention policy.

No behavioral tests in this procedure have been executed as part of this review.
