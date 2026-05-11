-- Enable RLS on all tables.
-- Service role key (used by FastAPI backends) bypasses RLS automatically.
-- Authenticated users (admin frontend via Supabase Auth) get read-only access.
-- Anonymous users get no access.

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts   ENABLE ROW LEVEL SECURITY;

-- patients: authenticated admins can read
CREATE POLICY "admins can read patients"
  ON patients FOR SELECT
  TO authenticated
  USING (true);

-- sessions: authenticated admins can read
CREATE POLICY "admins can read sessions"
  ON sessions FOR SELECT
  TO authenticated
  USING (true);

-- alerts: authenticated admins can read
CREATE POLICY "admins can read alerts"
  ON alerts FOR SELECT
  TO authenticated
  USING (true);
