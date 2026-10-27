-- The max and resting heart rate heart rate zones are worked out from, from
-- the date they took effect, so sessions are judged by the zones of their
-- day.
CREATE TABLE heart_rate_profiles (
    date TEXT PRIMARY KEY,
    max_hr REAL NOT NULL,
    resting_hr REAL NOT NULL
);
