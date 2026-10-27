-- Where a long session's tempo block sits: 'end' for one finishing the
-- session, NULL for one in the middle, as every block planned before.
ALTER TABLE planned_sessions ADD COLUMN tempo_position TEXT;
