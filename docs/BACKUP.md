# Backup & recovery documentation

## Development API

State is a single JSON file at `apps/dev-api/data/db.json` (gitignored). Back it up by
copying the file while the server is stopped, or after `fsync`. Restore by replacing the
file and restarting the server. It is development data only.

## Supabase PostgreSQL

Use the platform's scheduled backups / point-in-time recovery for the project. In
addition, keep these reproducible artifacts in Git:

- `supabase/migrations/202611040001…010` — full schema, RLS, functions, policies.
- `supabase/seed/0001_catalog.sql` — generated from `packages/catalog/src/data/*.json`
  and `assets/images/IMAGE_SOURCES.json` via `npm run seed:supabase`.
- `assets/images/*` — verified originals and optimized derivatives with the manifest.

Logical backup example (run against your own project, credentials from the Supabase
dashboard — never store them in this repository):

```bash
pg_dump --format=custom --no-owner --no-acl --schema=public \
  --file=gowayy-public.dump "$DATABASE_URL"
pg_restore --clean --if-exists --dbname="$DATABASE_URL" gowayy-public.dump
```

Supabase Auth (`auth.*`), Storage objects and Realtime configuration are managed by the
platform and must be included in the platform-level backup plan. Re-run
`supabase db push` and re-deploy Edge Functions after a restore to verify schema/function
parity. Test a restore in a staging project before relying on it.

**Not performed in this workspace:** no hosted Supabase project, backup schedule or
restore test has been configured or verified.
