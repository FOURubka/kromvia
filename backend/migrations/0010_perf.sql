ALTER TABLE crashes ADD COLUMN projects TEXT;

CREATE TABLE perf_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created INTEGER NOT NULL,
  net TEXT NOT NULL,
  launcher TEXT NOT NULL,
  os TEXT NOT NULL,
  gpu TEXT NOT NULL,
  cpu TEXT NOT NULL,
  ram_gb INTEGER,
  mc TEXT NOT NULL,
  loader TEXT,
  fps_avg REAL,
  fps_low REAL,
  seconds INTEGER NOT NULL
);
CREATE INDEX perf_runs_gpu ON perf_runs(gpu, mc, created);
CREATE INDEX perf_runs_net ON perf_runs(net, created);

CREATE TABLE run_mods (
  kind TEXT NOT NULL,
  run INTEGER NOT NULL,
  project TEXT NOT NULL,
  net TEXT NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY (kind, run, project)
);
CREATE INDEX run_mods_project ON run_mods(project, kind, run);
CREATE INDEX perf_runs_created ON perf_runs(created);
CREATE INDEX run_mods_created ON run_mods(created);
