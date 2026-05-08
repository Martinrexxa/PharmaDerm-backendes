CREATE TABLE IF NOT EXISTS dermatologist_concerns (
  dermatologist_id INTEGER NOT NULL REFERENCES dermatologists(id) ON DELETE CASCADE,
  concern_code VARCHAR(40) NOT NULL,
  priority_score INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (dermatologist_id, concern_code)
);

CREATE TABLE IF NOT EXISTS dermatologist_skin_types (
  dermatologist_id INTEGER NOT NULL REFERENCES dermatologists(id) ON DELETE CASCADE,
  skin_type_code VARCHAR(20) NOT NULL,
  priority_score INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (dermatologist_id, skin_type_code)
);

ALTER TABLE dermatologist_concerns ENABLE ROW LEVEL SECURITY;
ALTER TABLE dermatologist_skin_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_dermatologist_concerns" ON dermatologist_concerns;
CREATE POLICY "public_select_dermatologist_concerns"
ON dermatologist_concerns
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "public_select_dermatologist_skin_types" ON dermatologist_skin_types;
CREATE POLICY "public_select_dermatologist_skin_types"
ON dermatologist_skin_types
FOR SELECT
TO anon, authenticated
USING (true);