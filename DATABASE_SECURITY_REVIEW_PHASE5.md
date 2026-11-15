# CINEVA security review — phase 5

**Scope:** static source inspection of authentication, profiles, favorites, playback history, messaging, administration, Storage, Realtime, catalogue reads and migrations through `20261110000300`. No database or hosted project was contacted.

## Implemented controls and remaining gaps

| Area | Source status | Security and functional notes |
|---|---|---|
| Authentication | Implemented in source; unverified against Auth | Signup, password login, logout, email callback, reset request, password update, `getUser()` checks and cookie refresh exist. No account was created and no email was sent. Cookie/session behavior needs Auth integration tests. |
| Profiles | Implemented in source; unverified against DB/Storage | Registration provisions a profile row by trigger; account page reads/updates the caller's profile; image upload binds path/metadata to caller and uses a private bucket with a short-lived signed preview URL. New migration `20261110000200` copies a trimmed, length-capped signup display name for new profiles only. Upload validates declared MIME and size but not file signature. |
| Favorites | Implemented in source; unverified against DB | Uses catalogue `contentId` UUID and unique key. Optimistic state changes only after request success. New migration replaces owner-all policy with active-user insert/delete guards and published content requirement; select stays owner scoped. No DB execution yet. |
| Playback history | Implemented in source; unverified against DB | Progress is stored per user/content part or episode and reuses unique rows. New migration denies writes for inactive users and unpublished targets. UI does not surface write failures; persistence and repeated-playback behavior need DB/API testing. |
| User discovery / user chat | Implemented in source; pending DB test | New RPC searches active profiles by display-name substring, excludes self, inactive and blocked users, exposes only UUID and display name, and returns up to 20 matches. The inbox now searches names and creates a direct conversation from a selected result; underlying `create_direct_conversation` remains authoritative. Abuse-rate limiting and live RLS/API verification remain outstanding. |
| User-to-admin chat | Implemented in source; unverified against DB | Support button calls `get_support_contact_id()` then the block-aware direct-conversation RPC. Requires migrations and an active administrator. |
| Inbox unread count | Implemented in source; unverified against DB | Uses private aggregate RPC and a fallback query. Fallback can conceal a missing RPC migration and needs removal or explicit migration status after deployment. |
| Realtime messages / counts | Implemented in source; unverified | Client subscribes to messages and receipts; migration conditionally adds those tables to publication. No live websocket test. General notification table is not in the publication and there is no notification center implementation found. |
| Read receipts | Implemented in source; unverified | Client inserts a receipt for loaded inbound messages with its own user ID; database policy binds receipt identity to `auth.uid()`. No forged receipt API test. |
| Blocking and reports | Implemented in source; unverified | Block toggles and message reporting are wired to RLS tables. Report prompt uses `window.prompt`; block state is queried client-side and server policy remains authoritative. No abuse/rate-limit tests. |
| Admin authorization | Implemented in source; unverified | Pages/actions check named permission RPCs and privileged message body access calls audited report-scoped RPC. Requires live JWT tests for ordinary admin vs message moderator; no claim is made that page guards alone authorize database access. |
| Private attachments | Incomplete | Private bucket and metadata policies exist, but message composer has no attachment upload/download UI or file validation workflow. Do not enable uploads until byte-level validation and Storage behavior tests are implemented. |
| Group conversations | Incomplete | Schema accepts `group` and participant table supports multiple users, but the client has no group creation/management workflow and direct-participant integrity trigger behavior needs isolated tests. |
| Catalogue importing | Implemented in source; dry-run verified | Deterministic upsert importer and read-only parity checker exist. Dry-run and Node syntax checks passed locally. Series genre mapping was missing and is now included in importer and parity expectations. Apply and live parity remain unverified because there is no isolated database; import records remain draft and media sources inactive. |
| Aggregate view counts | Missing | No secure aggregate view-count RPC/table was found. Existing `views_label` is display text only. Do not increment a public field from the browser or expose per-user viewing history. |

## Migration security findings

- Foundation migrations must be applied together and in order in a new database; migration 1 alone is not an RLS-secured intermediate state.
- Migration 2's initial activity/messaging policy set had insufficient active-account/content-publication guards for personal activity and selected messaging paths. Migration 3 addresses messaging; new migration `20261110000100` addresses favorite/history writes.
- New migration `20261110000200` fixes initial display-name persistence for newly registered accounts without backfilling or modifying existing user accounts.
- New migration `20261110000300` adds restricted name-based recipient discovery; it has not been applied or behavior-tested.
- `20261109000300` creates its trigger without an idempotency guard. It is safe under normal one-time migration history, not manual re-execution.
- Realtime publication membership does not prove subscription privacy; verify with actor JWTs.
- The attachment bucket's MIME allowlist and size cap do not prove the uploaded bytes match the declared type.
- The support lookup reveals the active support administrator's UUID to active signed-in users by design, but no email or private profile fields.
- Full per-migration dependencies, SQL notes, permission grants, RLS, Storage and Realtime decisions are in [DATABASE_MIGRATION_REVIEW_PHASE5.md](/C:/Users/dufit/cineva/DATABASE_MIGRATION_REVIEW_PHASE5.md).

## Verification boundary

Static inspection is not a security test. No migrations were applied; no local Supabase database was confirmed; no signed Auth JWT, Storage request or Realtime subscription was tested. `npm run typecheck` and `npm run build` validate the app code, not RLS or hosted behavior.
