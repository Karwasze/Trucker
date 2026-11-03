-- Whether the diet was kept to on a day, with the protein eaten if it was
-- counted.
CREATE TABLE diet_days (
    date TEXT PRIMARY KEY,
    adhered INTEGER NOT NULL,
    protein_g REAL
);

-- The daily protein target in grams, a single row once set.
CREATE TABLE diet_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    protein_target_g REAL
);
