-- Track how long each monitoring session lasted and why it closed.
-- Safe to re-run (IF NOT EXISTS / IF column does not exist via DO block).

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'sessions' AND column_name = 'duration_seconds'
    ) THEN
        ALTER TABLE sessions ADD COLUMN duration_seconds INTEGER;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'sessions' AND column_name = 'closed_reason'
    ) THEN
        -- Possible values: 'manual_logout' | 'device_disconnect' | 'auto_timeout'
        ALTER TABLE sessions ADD COLUMN closed_reason TEXT;
    END IF;
END
$$;
