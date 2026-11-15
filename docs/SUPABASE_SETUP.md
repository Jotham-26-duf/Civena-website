# Supabase setup and application integration

## Current prerequisites and status

This repository has no Supabase SDK dependency, database connection, or live credentials. A local-only `supabase/config.toml` now describes the CLI project; it has not been validated by the CLI because the CLI is unavailable. The attempted package retrieval could not reach its package source, so no package or lockfile changed. The server-side public catalogue adapter uses direct PostgREST `fetch` and needs only the project URL and publishable key. Authentication and writes are deliberately not presented as implemented.

## Configuration

Copy `.env.example` to an ignored local environment file and fill values from the Supabase project settings through a secure local workflow:

- `NEXT_PUBLIC_SUPABASE_URL`: project API URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: browser-safe publishable/anon key (used by server public reads here).
- `SUPABASE_SECRET_KEY`: server-only secret key for the one-time importer. Never expose it to Next browser bundles, commits, screenshots, or logs.

No values are included in the tracked example. Check hosting secret settings separately during deployment; no deployment is part of this work.

## Apply migrations / generate types (future, not run)

Install Supabase CLI and the supported `@supabase/ssr` / `@supabase/supabase-js` packages only through the approved dependency workflow. Start the local Supabase stack, review SQL, then use the version-appropriate local reset and type generation commands:

```powershell
supabase start
supabase db reset
supabase test db
supabase gen types typescript > src/types/database.types.ts
```

For a linked project, use the CLI's linked database type generation flow and review the generated diff. Never generate types from production unless authorized. The schema migrations are currently unexecuted and generated TypeScript database types do not yet exist.

## Intended Next.js integration

Use the current Supabase SSR package's cookie-backed server client in Server Components, Server Actions, and Route Handlers; add its request middleware/proxy according to the installed Next.js/Supabase versions. Keep a separate browser client only for user-driven realtime/UI needs. Server Components should call repositories directly, not the application's own Route Handlers. Server Actions must validate runtime inputs, authenticate and authorize each mutation, then return safe errors. Webhooks belong in Route Handlers with signature validation. Do not add a secret-key client to normal request paths unless a narrowly justified trusted operation needs it.

The current adapter reads anonymous published catalogue rows and passes them to the unchanged `Studio` component. With no Supabase URL/key it returns local arrays. Supplying only one public variable fails explicitly. A configured but empty catalogue returns empty arrays; it does not silently revert to stale local production data.

## Data types and local commands

After applying schema, generate and commit database types as a separate reviewed change. Supabase CLI v3 generates types from its local project with `supabase gen types typescript`; older CLI v2 uses `supabase gen types typescript --local`. Pin and verify the CLI version before relying on commands because CLI v3 changed defaults and flags. Supabase's current SSR guide calls for `@supabase/ssr` and `@supabase/supabase-js`; on this Next.js 16 app, use the `proxy.ts` session-refresh convention, cookie-backed server/client helpers, and verified claims (not an unverified cookie session) for authorization. These packages/client flows are not installed or configured yet. See the [Supabase SSR guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs) and [CLI v3 migration guide](https://supabase.com/docs/guides/local-development/cli/migrating-to-v3).

For recovery, enable the backup option appropriate to the chosen plan, take off-site logical exports where needed, and rehearse restoration to a separate project. Database backup products do not restore deleted Storage objects; back up or retain media objects separately and verify database-to-object references after restore. See [Supabase backup and restore documentation](https://supabase.com/docs/guides/platform/backups). Use the repository's `npm run typecheck`, `npm run build`, and the database test procedure documented in `DATABASE_TESTING.md`. This repository currently has no lint or test script. Secrets must stay local or in a secret manager.
