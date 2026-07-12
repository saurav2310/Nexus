-- This migration is applied AFTER Prisma creates the tables from schema.prisma.
-- Prisma doesn't understand RLS, so we manage this layer by hand.

-- Enable RLS on every tenant-scoped table
ALTER TABLE tenants        ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows      ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_runs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE step_runs      ENABLE ROW LEVEL SECURITY;

-- FORCE means even the table owner (our app's DB user) is subject to the policy.
-- Without FORCE, RLS is silently bypassed for whichever role owns the table -
-- a subtle footgun that defeats the entire point if missed.
ALTER TABLE workflows      FORCE ROW LEVEL SECURITY;
ALTER TABLE workflow_runs  FORCE ROW LEVEL SECURITY;
ALTER TABLE step_runs      FORCE ROW LEVEL SECURITY;

-- The policy: a row is visible/writable only if its tenant_id matches
-- the tenant_id set on the current database session.
CREATE POLICY tenant_isolation_workflows ON workflows
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_workflow_runs ON workflow_runs
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_step_runs ON step_runs
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Note: 'tenants' itself is intentionally left without a row policy for now -
-- there's no tenant context yet when you're looking up which tenant you are.
-- We'll revisit this when we add a platform-admin role in a later phase.
