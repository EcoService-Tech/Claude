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
  template_id TEXT,                           -- modèle de dossier utilisé, s'il y en a un
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
  user_agent TEXT,
  otp_hash TEXT,                              -- code de vérification (empreinte), jamais en clair
  otp_expires_at TEXT,
  otp_sent_at TEXT,
  otp_sends INTEGER NOT NULL DEFAULT 0,
  otp_attempts INTEGER NOT NULL DEFAULT 0,
  identity_verified_at TEXT,
  reminders INTEGER NOT NULL DEFAULT 0,
  last_reminder_at TEXT,
  onsite INTEGER NOT NULL DEFAULT 0,          -- signe sur place, sur l'appareil de l'établissement : pas d'email
  declined_at TEXT,
  decline_reason TEXT,
  cert_info TEXT                              -- signature par certificat électronique : titulaire, émetteur, vérifications
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

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  file_name TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL                          -- {title, documents, stamps, slots:[{role, placements, onsite}]}
);
-- Demandes des membres : résiliation ou suspension, signées et horodatées
CREATE TABLE IF NOT EXISTS member_requests (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,                         -- resiliation | suspension
  created_at TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  member_ref TEXT,
  start_date TEXT,
  end_date TEXT,
  reason TEXT,
  consent_text TEXT NOT NULL,
  method TEXT,
  ip TEXT,
  country TEXT,
  city TEXT,
  user_agent TEXT,
  email_verified_at TEXT,
  status TEXT NOT NULL DEFAULT 'received',    -- received | accepted | refused
  decision_note TEXT,
  decided_at TEXT,
  pdf_hash TEXT
);
