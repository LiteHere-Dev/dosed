-- Adds: critical-dose flag + refill tracking + photo on medications, a vet
-- contact email on pets, "who actually gave this dose" attribution on
-- dose_logs, a household-sharing table (pet_shares), and a health_logs
-- table for side-effect/mood/weight/stool quick-logs.

ALTER TABLE medications ADD COLUMN IF NOT EXISTS critical BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE medications ADD COLUMN IF NOT EXISTS total_quantity REAL;
ALTER TABLE medications ADD COLUMN IF NOT EXISTS remaining_quantity REAL;
ALTER TABLE medications ADD COLUMN IF NOT EXISTS refill_threshold REAL;
ALTER TABLE medications ADD COLUMN IF NOT EXISTS photo_uri TEXT;

ALTER TABLE pets ADD COLUMN IF NOT EXISTS vet_email TEXT;

-- Who actually tapped "Give" — distinct from user_id, which (for a shared
-- pet) stays the pet owner's id so the existing per-owner storage/export
-- model doesn't change. logged_by_* is purely for display ("given by Sam
-- at 8:02am") and for preventing accidental double-dosing in a household.
ALTER TABLE dose_logs ADD COLUMN IF NOT EXISTS logged_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE dose_logs ADD COLUMN IF NOT EXISTS logged_by_label TEXT;

-- Household sharing. A pet has one owner (pets.user_id, unchanged) and any
-- number of accepted caregivers who can view the pet and log doses, but
-- cannot edit the pet profile or medication schedule — see routes/sync.ts,
-- which still restricts pet/medication writes to the owner. invite_token_hash
-- follows the same "store only the hash" pattern as refresh/reset tokens.
CREATE TABLE IF NOT EXISTS pet_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_email TEXT NOT NULL,
  member_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'caregiver',
  status TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | revoked
  invite_token_hash TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pet_shares_pet ON pet_shares(pet_id);
CREATE INDEX IF NOT EXISTS idx_pet_shares_member ON pet_shares(member_user_id) WHERE status = 'accepted';
-- One live invite per (pet, email) at a time — re-inviting after a revoke
-- or after acceptance is fine, only a *pending* duplicate is blocked.
CREATE UNIQUE INDEX IF NOT EXISTS pet_shares_pending_unique ON pet_shares(pet_id, lower(invited_email)) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS health_logs (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- pet owner, mirrors dose_logs
  pet_id UUID NOT NULL,
  type TEXT NOT NULL, -- side_effect | mood | weight | stool
  value TEXT NOT NULL,
  note TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  logged_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  logged_by_label TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_health_logs_pet_time ON health_logs(pet_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_logs_user_updated ON health_logs(user_id, updated_at);
