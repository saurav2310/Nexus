# Nexus — Multi-Tenant AI Workflow Automation Platform

## Phase 1 status: core multi-tenancy + workflow CRUD (in progress)

## Architecture decisions made so far

### Tenancy model: row-level with Postgres RLS (not schema-per-tenant, not DB-per-tenant)
Chosen for scalability to a large number of tenants and simplicity of cross-tenant
analytics, at the cost of relying on correct `tenant_id` filtering everywhere.
That risk is mitigated by enforcing isolation at the database layer via
`ROW LEVEL SECURITY` policies (see `prisma/migrations/.../migration.sql`), so a
missing `WHERE` clause in application code fails closed (returns zero rows)
rather than leaking data across tenants.

### Connection pooling + RLS
Postgres session variables (`SET`) persist on a connection until changed, and
Prisma reuses pooled connections across unrelated requests. To prevent tenant
context leaking between requests, every tenant-scoped query goes through
`PrismaService.forTenant()`, which sets `app.tenant_id` via
`SET LOCAL` (scoped strictly to one transaction) rather than a bare `SET`.

### Tenant identity: currently a stub
`TenantMiddleware` currently reads tenant ID from an `x-tenant-id` header.
This is explicitly insecure and is a placeholder until JWT-based auth is
added — a header is trivially spoofable by any client, so real tenant identity
must come from a verified, signed token, never a raw request header.

## Local setup

```bash
docker compose up -d          # starts Postgres + Redis
cp .env.example .env
npm install
npx prisma migrate dev        # creates tables, then applies the RLS migration
npm run start:dev
```

Test it (replace tenant IDs once you've seeded a `Tenant` row via `prisma studio`):

```bash
curl -X POST http://localhost:3000/workflows \
  -H "x-tenant-id: <tenant-uuid>" \
  -H "Content-Type: application/json" \
  -d '{"name": "My first workflow", "definition": {"steps": []}}'

curl http://localhost:3000/workflows -H "x-tenant-id: <tenant-uuid>"
```

Try omitting the header, or using a different tenant UUID than the one you
created a workflow under — you should get zero rows back, not an error and
not someone else's data. That's RLS doing its job.

## Next up (Lesson 2)
Designing the workflow DAG execution engine: how steps declare dependencies,
how BullMQ runs them, and where retries/idempotency come in.
