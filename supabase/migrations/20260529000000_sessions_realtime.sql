-- Enable Postgres logical replication for the sessions table so Supabase
-- Realtime can deliver row-level change events to subscribers.
--
-- REPLICA IDENTITY FULL: include the full old row in UPDATE/DELETE events so
-- the frontend can match the changed row by primary key even when 'id' is
-- not in the changed columns.
--
-- Run this in the Supabase SQL editor, then verify in the dashboard:
--   Database → Replication → supabase_realtime publication → sessions ✓

ALTER TABLE sessions REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
