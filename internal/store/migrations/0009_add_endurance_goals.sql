-- An endurance goal (a race on race_date over the given legs) and the dated
-- plan generated to get there.
CREATE TABLE goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    race_date TEXT NOT NULL,
    start_date TEXT NOT NULL,
    swim_m REAL,
    bike_m REAL,
    run_m REAL,
    -- Bitmask of training days, bit 0 = Monday.
    weekdays INTEGER NOT NULL,
    -- Weekday of the long session, 1 = Monday.
    long_day INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE planned_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id INTEGER NOT NULL REFERENCES goals(id),
    date TEXT NOT NULL,
    activity TEXT NOT NULL,
    kind TEXT NOT NULL,
    phase TEXT NOT NULL,
    target_distance_m REAL,
    target_duration_s REAL,
    intensity TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL,
    -- Checkable targets; speeds are in m/s for every sport.
    speed_min REAL,
    speed_max REAL,
    hr_min REAL,
    hr_max REAL,
    reps INTEGER,
    rep_distance_m REAL,
    rep_duration_s REAL,
    recovery_s REAL,
    -- The imported workout that filled the session.
    cardio_workout_id INTEGER UNIQUE REFERENCES cardio_workouts(id)
);

CREATE INDEX idx_planned_sessions_goal_date ON planned_sessions(goal_id, date);
