ALTER TABLE shares ADD COLUMN public INTEGER NOT NULL DEFAULT 0;
CREATE INDEX shares_public ON shares(public, created);
