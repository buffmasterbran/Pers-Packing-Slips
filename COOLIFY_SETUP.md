# Coolify Deployment Setup (Next.js + Postgres 16)

This project can auto-deploy from Git pushes in Coolify.

## 1) Create/attach services in Coolify

- Application: this Next.js repo
- Database: PostgreSQL 16 service (same Coolify project/environment)

## 2) Configure build/start for app service

Use the Node/Next.js defaults (Nixpacks) or set explicitly:

- Build command: `npm run build`
- Start command: `npm run start`
- Port: `3000`

## 3) Add environment variables to the app service

### Database

Recommended (single URL):

- `DATABASE_URL=postgresql://<user>:<password>@<postgres-service-name>:5432/<db>`
- `DB_SSL_MODE=disable`

Or provide parts instead of `DATABASE_URL`:

- `POSTGRES_HOST=<postgres-service-name>`
- `POSTGRES_PORT=5432`
- `POSTGRES_USER=<user>`
- `POSTGRES_PASSWORD=<password>`
- `POSTGRES_DB=<db>`
- `DB_SSL_MODE=disable`

Notes:
- Internal Coolify Postgres typically does **not** need SSL (`DB_SSL_MODE=disable`).
- If using managed external DB, use:
  - `DB_SSL_MODE=require` (strict cert validation), or
  - `DB_SSL_MODE=no-verify` (less strict, for self-signed chains).

### NetSuite API

Required for `/api/orders`:

- `NETSUITE_RESTLET_URL`
- `NETSUITE_REALM`
- `NETSUITE_OAUTH_CONSUMER_KEY`
- `NETSUITE_OAUTH_CONSUMER_SECRET`
- `NETSUITE_OAUTH_TOKEN`
- `NETSUITE_OAUTH_TOKEN_SECRET`

## 4) Auto deploy on push

In Coolify, keep auto-deploy enabled on your connected Git branch (usually `master` or `main`).
Then each push triggers a new deployment automatically.

## 5) Quick verification after deploy

1. Open app URL
2. Confirm orders load
3. Confirm printed status reads/writes (Postgres table `printed_orders` is auto-created on first use)
