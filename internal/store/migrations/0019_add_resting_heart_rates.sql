-- The resting heart rate Apple Health recorded each day (bpm, the day's
-- average), for its trend and for how hard sessions were relative to it.
CREATE TABLE resting_heart_rates (
    date TEXT PRIMARY KEY,
    bpm REAL NOT NULL
);
