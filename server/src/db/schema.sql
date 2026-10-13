-- Infodemic schema. Safe to run repeatedly (every statement is idempotent).

CREATE TABLE IF NOT EXISTS datasets (
  id          SERIAL PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'other',
  description TEXT,
  url         TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS narratives (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  summary     TEXT,
  category    TEXT,
  verdict     TEXT NOT NULL DEFAULT 'unverified',
  fact_check  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS claims (
  id               SERIAL PRIMARY KEY,
  narrative_id     INTEGER NOT NULL REFERENCES narratives(id) ON DELETE CASCADE,
  parent_id        INTEGER REFERENCES claims(id) ON DELETE SET NULL,
  dataset_id       INTEGER REFERENCES datasets(id) ON DELETE SET NULL,
  text             TEXT NOT NULL,
  author           TEXT,
  source_url       TEXT,
  region           TEXT,
  language         TEXT NOT NULL DEFAULT 'en',
  reach            INTEGER NOT NULL DEFAULT 0 CHECK (reach >= 0),
  published_at     TIMESTAMPTZ NOT NULL,
  similarity       REAL,
  drift            REAL,
  generation       INTEGER NOT NULL DEFAULT 0,
  mutation_type    TEXT NOT NULL DEFAULT 'origin',
  mutation_tags    TEXT[] NOT NULL DEFAULT '{}',
  mutation_signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding        REAL[],
  embedding_model  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS claims_narrative_idx ON claims (narrative_id);
CREATE INDEX IF NOT EXISTS claims_parent_idx ON claims (parent_id);
CREATE INDEX IF NOT EXISTS claims_published_idx ON claims (published_at);
CREATE INDEX IF NOT EXISTS claims_dataset_idx ON claims (dataset_id);

-- Similarity links between claims that are not parent and child
-- (for example the same idea surfacing in two different narratives).
CREATE TABLE IF NOT EXISTS claim_links (
  source_id  INTEGER NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  target_id  INTEGER NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  similarity REAL NOT NULL,
  PRIMARY KEY (source_id, target_id),
  CHECK (source_id < target_id)
);

CREATE INDEX IF NOT EXISTS claim_links_target_idx ON claim_links (target_id);
