CREATE TABLE clans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_lower TEXT NOT NULL UNIQUE,
  tag TEXT NOT NULL,
  tag_lower TEXT NOT NULL UNIQUE,
  icon TEXT NOT NULL,
  open INTEGER NOT NULL DEFAULT 1,
  owner TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  created INTEGER NOT NULL
);

CREATE TABLE clan_members (
  account TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  clan TEXT NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  joined INTEGER NOT NULL
);
CREATE INDEX clan_members_clan ON clan_members(clan, joined);

CREATE TABLE clan_requests (
  clan TEXT NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created INTEGER NOT NULL,
  PRIMARY KEY (clan, account)
);
CREATE INDEX clan_requests_account ON clan_requests(account);

INSERT INTO clans (id, name, name_lower, tag, tag_lower, icon, open, owner, created)
VALUES ('kromvia', 'Kromvia', 'kromvia', 'Kromvia', 'kromvia', 'kromvia', 1, (SELECT id FROM accounts WHERE name_lower = '_4rubka_'), 1795046400000);

INSERT INTO clan_members (account, clan, role, joined)
SELECT id, 'kromvia', 'owner', 1795046400000 FROM accounts WHERE name_lower = '_4rubka_';
