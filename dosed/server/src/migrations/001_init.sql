CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every synced table carries id (client-generated UUID, stable across
-- devices), user_id for ownership/isolation, updated_at for last-write-wins
-- conflict resolution, and deleted_at as a tombstone so deletions replicate
-- to other devices instead of only disappearing locally.

CREATE TABLE IF NOT EXISTS pets (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  species TEXT NOT NULL,
  breed TEXT,
  weight_kg REAL,
  photo_uri TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS medications (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pet_id UUID NOT NULL,
  name TEXT NOT NULL,
  dosage_value REAL NOT NULL,
  dosage_unit TEXT NOT NULL,
  schedule_type TEXT NOT NULL,
  times JSONB NOT NULL DEFAULT '[]',
  interval_hours REAL,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS dose_logs (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  medication_id UUID NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  taken_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  amount_taken REAL,
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pets_user_updated ON pets(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_meds_user_updated ON medications(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_logs_user_updated ON dose_logs(user_id, updated_at);
