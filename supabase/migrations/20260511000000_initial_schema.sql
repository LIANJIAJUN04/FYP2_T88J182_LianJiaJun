CREATE TABLE patients (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  ic_number        TEXT UNIQUE NOT NULL,
  ward             TEXT,
  age              INTEGER,
  gender           TEXT,
  assigned_doctor  TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  UUID REFERENCES patients(id),
  started_at  TIMESTAMPTZ DEFAULT NOW(),
  ended_at    TIMESTAMPTZ
);

CREATE TABLE alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    UUID REFERENCES patients(id),
  metric        TEXT NOT NULL,
  value         FLOAT NOT NULL,
  triggered_at  TIMESTAMPTZ DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ
);

-- Admins managed by Supabase Auth (auth.users)

-- Explicit grants required for Supabase Data API (PostgREST / supabase-js).
-- New projects from 2026-05-30 no longer auto-expose public tables to the
-- Data API. These grants make the tables accessible via anon key,
-- authenticated JWT, and the service_role key used by the backend.
-- Existing projects: enforced on new tables from 2026-10-30.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.patients      TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sessions      TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.alerts        TO anon, authenticated, service_role;
