-- Endurance workouts imported from Apple Health. They have no sets, so they
-- live apart from the strength tables.
CREATE TABLE cardio_workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- Local date of the start (YYYY-MM-DD) and the start itself (RFC3339).
    date TEXT NOT NULL,
    started_at TEXT NOT NULL,
    activity TEXT NOT NULL,
    duration_seconds REAL NOT NULL,
    distance_m REAL,
    energy_kcal REAL,
    avg_heart_rate REAL,
    max_heart_rate REAL,
    swim_strokes INTEGER,
    lap_length_m REAL,
    -- JSON arrays of CardioSample and CardioLap.
    samples TEXT,
    laps TEXT,
    source TEXT,
    -- The HealthKit workout UUID, so a workout is only imported once.
    source_uuid TEXT UNIQUE
);

CREATE INDEX idx_cardio_workouts_date ON cardio_workouts(date);
