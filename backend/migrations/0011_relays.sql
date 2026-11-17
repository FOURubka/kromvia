CREATE TABLE relays (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  size INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT,
  holder TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  lock_until INTEGER NOT NULL DEFAULT 0,
  upload TEXT,
  upload_size INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL,
  updated_by TEXT REFERENCES accounts(id) ON DELETE SET NULL
);
CREATE INDEX relays_owner ON relays(owner);

CREATE TABLE relay_members (
  relay TEXT NOT NULL REFERENCES relays(id) ON DELETE CASCADE,
  account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (relay, account)
);
CREATE INDEX relay_members_account ON relay_members(account);
