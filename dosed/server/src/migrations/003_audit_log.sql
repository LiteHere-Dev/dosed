-- user_id is nullable: a failed login by an identifier that doesn't match
-- any account still gets logged (for the account-enumeration/lockout
-- picture), just with no user to attach it to.
CREATE TABLE IF NOT EXISTS security_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_user_time ON security_audit_log(user_id, created_at DESC);

-- "Immutable" enforced by a trigger, not just "nothing in the app code
-- happens to call UPDATE/DELETE on this table" — the latter is one
-- careless future PR away from being false. This holds regardless of
-- which DB role runs the query, including a compromised app credential.
CREATE OR REPLACE FUNCTION forbid_audit_log_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'security_audit_log is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS security_audit_log_immutable ON security_audit_log;
CREATE TRIGGER security_audit_log_immutable
  BEFORE UPDATE OR DELETE ON security_audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_log_mutation();
