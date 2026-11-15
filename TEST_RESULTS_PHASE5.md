# CINEVA test results — phase 5

**Run date:** 2026-11-10. Commands were run from `C:\Users\dufit\cineva`.

## Application checks

| Check | Command | Result |
|---|---|---|
| TypeScript | `npm.cmd run typecheck` | **Passed** — `tsc --noEmit` exited 0. |
| Production build | `npm.cmd run build` | **Passed** — Next.js 16.4.5 compiled, type-checked, generated all 14 static pages/routes, and exited 0. |
| Lint | `npm.cmd run lint` | **Not run** — package has no `lint` script; npm exited 1 with “Missing script: lint.” |
| Unit tests | `npm.cmd test` | **Not run** — package has no `test` script; npm exited 1 with “Missing script: test.” |

Typecheck and build were rerun after the messaging and poster changes. One typecheck attempt overlapped with Next build's `.next/types` regeneration and failed because generated type files were temporarily absent; after the build finished, the sequential typecheck passed.

| Additional local check | Command | Result |
|---|---|---|
| Catalogue importer dry-run | `node scripts/import-catalogue.mjs` | **Passed** — 3 movies, 2 movie parts, 1 series, 1 season, 1 episode, 5 genres, 1 asset, 7 sources; `missingLocalAssets: []`; output confirmed no database was contacted. |
| Importer syntax | `node --check scripts/import-catalogue.mjs` | **Passed** — exited 0. |
| Parity checker syntax | `node --check scripts/verify-catalogue-parity.mjs` | **Passed** — exited 0. |

## Database tooling and tests

- Docker: **unavailable** — not found on `PATH` or at the standard Docker Desktop executable path.
- PostgreSQL CLI (`psql`): **unavailable** — no command found.
- Supabase CLI: global command unavailable. The package-local CLI was present, but `supabase --version` failed while attempting to write `C:\Users\dufit\.supabase\telemetry.json.tmp...`; that path is outside the writable project workspace. CLI version was not verified.
- Local Supabase stack: **not started**.
- Migrations: **not applied**.
- `supabase test db` / pgTAP: **not run**. Eight assertions are prepared in `supabase/tests/rls_isolation.test.sql`, but the required new migrations have not been applied.
- Auth, RLS, Storage, signed URL, Realtime, importer, and playback API tests: **not run**.
- Hosted schema checks and hosted Supabase tests: **not run**.
- Hosted development project: **not contacted or modified**.

## New pgTAP coverage prepared, not executed

The RLS isolation test now plans eight assertions and includes:

1. User A cannot read User B's favorites.
2. User A cannot create a favorite for User B.
3. User A cannot add watch history for a draft title.
4. User A can add watch history for a published title.
5. A nonparticipant cannot read a private message.
6. A suspended synthetic user cannot create a favorite.
7. A new profile receives a trimmed display name from Auth metadata.
8. Recipient discovery excludes self, suspended users and blocked users.

These tests execute under simulated JWT claims and an authenticated database role. They are useful database policy tests but do not replace signed-user HTTP and websocket tests.
