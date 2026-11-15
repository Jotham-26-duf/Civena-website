# CINEVA implementation checklist — phase 5

Legend: **Implemented in source** means a code path exists; it does not mean integration behavior was verified. **Verified** is reserved for an executed test with a recorded result.

## Completed in this phase

- [x] Compared migration-review filenames: only `DATABASE_MIGRATION_REVIEW_PHASE5.md` exists; legacy `CINEVA_MIGRATION_REVIEW_PHASE5.md` is absent.
- [x] Reviewed all seven requested migrations in execution order and added per-migration verdicts.
- [x] Added forward-only migration `20261110000100_private_activity_write_guards.sql` for active-user and published-content guards on favorite/history writes.
- [x] Added forward-only migration `20261110000200_profile_display_name_provisioning.sql` to persist validated signup display names for new profiles without changing existing accounts.
- [x] Added forward-only migration `20261110000300_message_recipient_discovery.sql` and wired name-based recipient search into the inbox.
- [x] Added five pgTAP assertions: draft playback history rejected, published playback history accepted, suspended user favorite rejected, signup display-name copied, and recipient search excludes self/suspended/blocked users.
- [x] Removed broken local poster references for `legion.jpg` and `a-bona-fide-killer.jpg`; existing poster fallback remains in use.
- [x] Fixed series genre relationships in the catalogue importer and parity checker.
- [x] Ran the catalogue importer dry-run; it reported 3 movies, 2 parts, 1 series, 1 season, 1 episode, 5 genres, 1 asset, 7 sources, zero missing local assets, and no database contact.
- [x] Ran `npm.cmd run typecheck`: passed.
- [x] Ran `npm.cmd run build`: passed.
- [x] Attempted `npm.cmd run lint`: unavailable; no lint script is configured.
- [x] Attempted `npm.cmd test`: unavailable; no test script is configured.
- [x] Confirmed no Docker executable, `psql`, or global Supabase CLI was available to this workspace. The local CLI probe failed writing telemetry outside the writable workspace.
- [x] Confirmed no migration/database/live Supabase test was run and no hosted project was contacted.

## Implemented in code, pending integration verification

- [ ] Auth flows: registration, login, logout, confirmation callback, password recovery/change, cookie refresh and protected pages.
- [ ] Profile provisioning, display-name update, private profile image upload and signed preview (source is implemented; DB/Storage integration is unverified).
- [ ] Favorites persistence and content-ID mapping.
- [ ] Playback history persistence and upsert/repeated-playback behavior.
- [ ] Direct conversations, support contact lookup, paginated messages, read receipts, blocks, reports and message realtime.
- [ ] Permission-gated admin operations and audited reported-message retrieval.
- [ ] Unread count RPC and Realtime refresh.
- [ ] Public published-catalogue reads.

## Incomplete or missing

- [ ] Verify name-based recipient search against isolated database and review/rate-limit abuse at deployment scale.
- [ ] Group conversation creation, participant management and group-aware inbox display.
- [ ] Private message attachment upload, download, metadata lifecycle, signature validation and cleanup.
- [ ] Notification center and Realtime publication/refresh for the `notifications` table.
- [ ] Secure aggregate view counts with privacy-preserving database-side RPC.
- [ ] Run importer apply and parity only against an authorized disposable database; current dry-run is validated, apply is deliberately unexecuted.
- [ ] Integration tests for all Supabase/Auth/RLS/Storage/Realtime behavior.

## Required next actions

1. Install/start Docker Desktop or provide a working Docker daemon, then run a local-only Supabase CLI version check with telemetry directed to a writable location.
2. Confirm the local endpoint, then separately authorize applying migrations to a disposable local database. Never use the linked hosted project for this task.
3. Run the expanded pgTAP suite and authenticated API tests, repair any demonstrated policy failures in forward migrations.
4. Implement recipient discovery, group conversations, attachment security/UI, notifications, importer and aggregate view counts against the reviewed schema.
5. Run independent Auth, Storage and Realtime behavior tests using synthetic accounts in the disposable local stack.

No deploy, push, commit, hosted migration, or account modification was performed.
