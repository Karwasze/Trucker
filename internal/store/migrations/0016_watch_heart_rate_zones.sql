-- Heart rate zones can come as Apple Watch has them in Health: zone_starts
-- is where zones 2 and up start, a JSON array of bpm, in place of the max
-- and resting heart rate they're otherwise worked out from, so those become
-- optional. SQLite can't drop NOT NULL in place, so the table is rebuilt,
-- keeping every profile.
CREATE TABLE heart_rate_profiles_new (
    date TEXT PRIMARY KEY,
    max_hr REAL,
    resting_hr REAL,
    zone_starts TEXT
);
INSERT INTO heart_rate_profiles_new (date, max_hr, resting_hr)
    SELECT date, max_hr, resting_hr FROM heart_rate_profiles;
DROP TABLE heart_rate_profiles;
ALTER TABLE heart_rate_profiles_new RENAME TO heart_rate_profiles;
