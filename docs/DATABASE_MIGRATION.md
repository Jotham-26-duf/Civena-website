# CINEVA catalogue migration

## Source inventory (inspected)

`src/data/movies.ts` contains 3 movies (legacy IDs `340`, `150`, `341`) and 2 movie parts. `src/data/series.ts` contains series ID `1`, one season (`raising-dion-season-2-s2`) and one episode (`2092`). Movie and series interfaces preserve the current UI properties. Existing source URLs are not fetched or verified. The source catalogues remain untouched and are still the fallback when Supabase public config is absent.

## Importer behavior

Run the report-only pass from the project root:

```powershell
node --experimental-strip-types scripts/import-catalogue.mjs
```

The inspected report found 3 movies, 2 parts, 1 series, 1 season, 1 episode, 5 distinct movie genres, 3 unique local artwork references, and 7 non-empty media references. Two local poster files referenced by the current data are missing: `/images/movies/legion.jpg` and `/images/movies/a-bona-fide-killer.jpg`. The report checks the local files only; it does not fetch media URLs.

Importer rules:

- Deterministic UUIDv5-shaped IDs (SHA-256-derived UUID version bits) make source records repeatable across runs. This is deterministic UUID generation, not standards-based UUIDv5; collisions are exceptionally unlikely but should be checked in the target database.
- Existing numeric catalogue IDs and string child legacy IDs are stored in legacy columns. Parent foreign keys use database UUIDs.
- Content imports as `draft`; every playback/trailer/download source imports inactive and non-public. No source is represented as verified/authorized.
- Legacy artwork paths are stored as `legacy_local` references. No upload or fake replacement is created.
- Existing descriptions, IDs, slugs, dates, genres, part/season/episode relationships and media URL strings are mapped without network access.
- Upserts use stable IDs/unique source keys; reruns merge matching records. The importer does not delete target records absent from source.
- Run without `--apply` for dry-run. The apply mode requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` in the process environment and contacts Supabase REST. Do not pass secrets on a command line or paste them in logs. This workspace has no credentials and apply was not run.

## Import sequence and parity

The script upserts artwork metadata, shared parent content/subtype rows, genres and junctions, movie parts, seasons, episodes, then media sources. Supabase transactions apply per HTTP request, not as one all-or-nothing transaction across every table; stable IDs/upserts allow rerun after a partial failure. For a production migration, use a reviewed SQL/CLI transaction or staging workflow if strict catalogue-wide atomicity is required. A separate read-only verifier compares source records, relationships, artwork metadata, and exact media-source references without printing URL values:

```powershell
node --experimental-strip-types scripts/verify-catalogue-parity.mjs
```

It requires the project URL and server-only secret key and should run after import against a disposable or authorized target. It scopes comparison to source identities so unrelated catalogue records are not treated as parity errors. The verifier was not run because this workspace has no credentials or database connection.

## Safe procedure

1. Create a disposable Supabase project and configure local environment outside version control.
2. Apply migrations in order with Supabase CLI after static review.
3. Run the dry run and save output without credentials.
4. Back up the empty target and run `node --experimental-strip-types scripts/import-catalogue.mjs --apply` from a trusted shell.
5. Run `node --experimental-strip-types scripts/verify-catalogue-parity.mjs` and investigate all mismatches before publication.
6. Keep imported records draft and sources inactive until an authorized editor reviews them.
7. After approval, publish content and explicitly mark only approved, public sources active/public.

No live database import or parity comparison has occurred.
