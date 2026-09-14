# Using Supabase (PostgreSQL) with RxGuard

RxGuard's Laravel backend now talks to Supabase's managed Postgres through
Laravel's standard `pgsql` driver — Supabase doesn't need a special
package, just correct connection settings.

## 1. Get your connection details

In the Supabase dashboard: **Project Settings → Database → Connection
parameters** (or **Connection string → PSQL**). You need:

- Host — e.g. `db.abcdEFGH1234.supabase.co`
- Port — `5432` (Session pooler / direct) or `6543` (Transaction pooler)
- Database — usually `postgres`
- User — usually `postgres`
- Password — the DB password you set when creating the project

## 2. Configure `.env`

```env
DB_CONNECTION=pgsql
# If your machine is IPv4-only, use the pooler hostname instead of a direct
# IPv6-only host, for example: aws-0-eu-central-1.pooler.supabase.com
DB_HOST=aws-0-eu-central-1.pooler.supabase.com
DB_PORT=5432
DB_DATABASE=postgres
DB_USERNAME=postgres
DB_PASSWORD=your-supabase-database-password
DB_SCHEMA=public
DB_SSLMODE=require
DB_EMULATE_PREPARES=true
```

- **Session pooler (5432)** — works like a normal persistent Postgres
  connection; the easiest choice for a standard PHP-FPM deployment.
- **Transaction pooler (6543 / pgbouncer)** — needed for serverless or
  very high-connection-count environments. Because pgbouncer in
  transaction mode doesn't support server-side prepared statements,
  keep `DB_EMULATE_PREPARES=true` (already the default in
  `config/database.php`) when using this port.

`DB_SSLMODE=require` is set because Supabase requires TLS on every
connection.

## 3. Install the Postgres PHP extension

Locally: enable `pdo_pgsql` in your `php.ini` (`extension=pdo_pgsql`).

In Docker: `docker/Dockerfile.backend` now installs `pdo_pgsql`/`pgsql`
via `postgresql-dev` + `docker-php-ext-install` instead of `pdo_mysql`.

## 4. Run migrations

```bash
php artisan migrate
```

All of RxGuard's migrations use Laravel's database-agnostic Schema
Builder, so they run unmodified against Postgres.

## 5. What changed for Postgres compatibility

- `config/database.php` — `pgsql` connection now defaults `sslmode` to
  `require` and adds a `DB_EMULATE_PREPARES` option for pooler support.
- `app/Http/Controllers/Api/AdminController.php` — replaced MySQL's
  `DATE_FORMAT(created_at, "%Y-%m")` with Postgres's
  `TO_CHAR(created_at, 'YYYY-MM')`, and scoped the
  `information_schema.tables` check to `table_schema = 'public'`.
- `docker/docker-compose.yml` — removed the local `mysql` container;
  the backend/queue/scheduler services now read `DB_HOST`, `DB_PORT`,
  etc. from the environment and connect straight to Supabase.
- `docker/Dockerfile.backend` — swapped the `pdo_mysql` PHP extension
  for `pdo_pgsql`/`pgsql`.

`database/schema.sql` is a legacy MySQL dump kept only for historical
reference — it's no longer used by Docker or by the app; the
`database/migrations/*.php` files are the source of truth for schema
on Postgres/Supabase.

## Optional: using Supabase's own APIs (not required for this app)

RxGuard talks to Postgres directly via Eloquent/the query builder, so
you do **not** need the Supabase PHP client or REST/PostgREST layer for
the backend to work. If you later want to use Supabase Auth, Storage,
or Realtime from the frontend/mobile clients, you'd add the
`SUPABASE_URL` / anon / service-role keys and call Supabase's REST API
separately — that's independent of the `DB_*` settings above.
