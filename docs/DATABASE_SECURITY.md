# CINEVA database security model

## Trust boundaries

All 39 application tables have RLS enabled. Default table grants are revoked, followed by narrow grants. `auth.uid()` is the identity source; client-submitted IDs are checked by RLS. The public publishable key is not a secret and is safe only with RLS enabled. Never use Supabase secret/service-role keys in client bundles or `NEXT_PUBLIC_*` variables.

| Actor | Intended access |
|---|---|
| Anonymous | Published public catalogue, public genres/categories/artwork, active media sources marked public, published announcements, published reviews/comments |
| Authenticated user | Above plus own profile/preferences, favorites, lists, progress, ratings, submissions, notifications, and active conversation data |
| Moderator | Only explicitly assigned moderation permissions; report/comment review; message access only through the audited report-scoped RPC |
| Administrator | Only named permissions assigned to administrator role; sensitive role/account/content actions use protected RPCs and audit triggers |

The schema creates named permissions (`content.manage`, `users.manage`, `reports.review`, `comments.moderate`, `messages.moderate`, `announcements.manage`, `audit.read`). Role assignment and role-permission changes are routed through SECURITY DEFINER functions which validate caller permissions and protect the final active administrator. Ordinary users cannot write role tables directly. Review permission seeds before applying in a real project and provision the first administrator through a separately authenticated operator procedure; never self-promote via SQL from the browser.

## Row-level behavior

- Content rows are anonymous-readable only while published; draft/archived rows require `content.manage`. Child relationships apply parent publication checks. Episodes also require published episode status.
- Profiles are self-readable/updatable, with limited update columns. User roles/preferences/activity are owner-scoped. User ID cannot be forged because policy compares to `auth.uid()`.
- Notifications are recipient-readable and can only have `read_at` updated. Recipients/content are not client-writable.
- Conversation/message/attachment/read-receipt policies require an active participant. The direct-conversation RPC requires an active caller and active target, refuses self-messaging or blocked pairs, canonicalizes the pair, and adds both participants in one transaction.
- No administrator receives blanket message SELECT. Exceptional reported-message access is through `get_reported_message_for_moderation`, permission-checked and audited. Review this function and the audit policy before any production use.
- Storage buckets: `public-artwork` is public-read and content-admin-write; `profile-images` is private and owner-folder scoped; `private-message-attachments` is private and participant scoped with object path `<conversation_uuid>/<uploader_uuid>/<object_name>`.
- Upload bucket MIME allowlists and size limits are server-side guardrails, not full content inspection. Validate actual file signatures, decode images, rate-limit uploads, and remove orphan objects in a trusted worker.
- Public sources require both `is_active` and `is_public`; importer sets both false. Signed provider URLs should be minted server-side and short-lived. Audit JSON omits `external_reference` to avoid retaining URL query credentials.
- Audit table has no client writes. Trigger-generated records are append-only to ordinary roles and permission-gated for reading. Database owner/service role can still alter them; use managed backups and external audit export if tamper-evidence is required.

## SECURITY DEFINER review

Functions set a constrained `search_path`, revoke default execution, and grant only required roles. Before applying, review each function as privileged code. In particular, confirm `auth.uid()` is non-null where required, target ownership is validated, no dynamic SQL is introduced unsafely, and every exceptional read creates an audit record. Do not broadly grant service-role access to application clients.

## Required live RLS test matrix

After applying migrations in a disposable project, run tests with anonymous, User A, User B, moderator, and administrator JWTs. Verify positive access plus negative cross-user access: A cannot select/update/delete B's favorites, watch history, preferences, notifications, profile, or private conversations; a nonparticipant cannot select messages/attachments/read receipts; a moderator without `messages.moderate` cannot access the reported-message RPC; a role cannot assign itself permissions; anonymous cannot read draft content or inactive/private source URLs. Verify Storage paths cannot be guessed across profile/conversation boundaries. No live RLS tests ran in this workspace.

## Remaining controls before production

Add rate limits and abuse controls to signup, search, messaging, reports, and uploads; CAPTCHA/email verification as product policy requires; database backups/PITR and tested restoration; provider authorization review; application security headers; dependency scanning; secret rotation; and a formal data retention/deletion policy. RLS does not replace server input validation or business authorization.
