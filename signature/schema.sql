CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',       -- draft | pending | final | cancelled
  original_hash TEXT,
  original_size INTEGER,
  stamps TEXT NOT NULL DEFAULT '[]',          -- emplacements du cachet [{page,x,y,w}]
  documents TEXT NOT NULL DEFAULT '[]',       -- documents réunis dans le dossier [{name,from,to,sha256,size}]
  final_hash TEXT,
  finalized_at TEXT
);
CREATE TABLE IF NOT EXISTS signers (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT,
  token TEXT NOT NULL UNIQUE,
  placements TEXT NOT NULL DEFAULT '[]',      -- [{page,x,y,w,h}]
  status TEXT NOT NULL DEFAULT 'waiting',     -- waiting | signed
  first_opened_at TEXT,
  signed_at TEXT,
  consent_at TEXT,
  consent_text TEXT,
  declared_name TEXT,
  declared_id TEXT,
  method TEXT,
  ip TEXT,
  country TEXT,
  city TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS signers_request ON signers(request_id);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  signer_id TEXT,
  type TEXT NOT NULL,
  at TEXT NOT NULL,
  ip TEXT,
  country TEXT,
  user_agent TEXT,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS events_request ON events(request_id, id);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
