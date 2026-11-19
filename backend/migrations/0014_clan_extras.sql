ALTER TABLE clans ADD COLUMN cape TEXT;

CREATE TABLE clan_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clan TEXT NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  from_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created INTEGER NOT NULL
);
CREATE INDEX clan_messages_clan ON clan_messages(clan, id);
