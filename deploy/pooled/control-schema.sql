-- Operator-managed fleet registry, matching the app's existing read contract.
CREATE TABLE IF NOT EXISTS cp_workspace_registry (
  workspace_key text PRIMARY KEY,
  contract_version integer NOT NULL DEFAULT 1 CHECK (contract_version = 1),
  state text NOT NULL CHECK (state IN ('active','suspended','deleting')),
  state_reason text,
  primary_hostname text NOT NULL UNIQUE,
  base_url text NOT NULL,
  db_pooled_url text NOT NULL,
  db_direct_url text NOT NULL,
  db_name text NOT NULL UNIQUE,
  db_role text NOT NULL UNIQUE,
  db_credential_ref text NOT NULL,
  app_secrets_ref text NOT NULL,
  workspace_id uuid NOT NULL UNIQUE,
  fingerprint_stamped_at timestamptz NOT NULL,
  storage jsonb NOT NULL,
  email_from text NOT NULL,
  mail_slug text NOT NULL UNIQUE,
  ai_enabled boolean NOT NULL DEFAULT false,
  revision bigint NOT NULL DEFAULT 1,
  pg_database_oid bigint,
  pg_cluster_id text
);
CREATE TABLE IF NOT EXISTS cp_workspace_hostnames (
  hostname text PRIMARY KEY,
  workspace_key text NOT NULL REFERENCES cp_workspace_registry(workspace_key) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('system','platform','platform_redirect','custom')),
  redirect_to_hostname text
);
CREATE INDEX IF NOT EXISTS cp_workspace_hostnames_workspace_idx ON cp_workspace_hostnames(workspace_key);
CREATE TABLE IF NOT EXISTS cp_workspace_activity (
  workspace_key text PRIMARY KEY REFERENCES cp_workspace_registry(workspace_key) ON DELETE CASCADE,
  last_active_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS cp_workspace_schema_state (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_key text NOT NULL UNIQUE REFERENCES cp_workspace_registry(workspace_key) ON DELETE CASCADE,
  target_version bigint NOT NULL,
  cohort text NOT NULL DEFAULT 'default',
  current_version bigint,
  applied_count integer,
  postconditions_ok boolean,
  last_verified_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','succeeded','failed','blocked')),
  run_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  lease_token uuid,
  locked_until timestamptz,
  locked_by text,
  last_error text,
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'running') = (lease_token IS NOT NULL AND locked_until IS NOT NULL))
);
CREATE OR REPLACE FUNCTION cp_workspace_bump_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.revision := OLD.revision + 1; RETURN NEW; END;
$$;
CREATE OR REPLACE TRIGGER cp_workspace_registry_revision BEFORE UPDATE ON cp_workspace_registry
FOR EACH ROW EXECUTE FUNCTION cp_workspace_bump_revision();
