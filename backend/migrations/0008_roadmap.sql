CREATE TABLE roadmap_votes (
  item TEXT NOT NULL,
  net TEXT NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY (item, net)
);
