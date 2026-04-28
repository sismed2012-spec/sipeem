-- Migration 015: add fuentes_count to pulso_digital
-- Makes Pulso Digital schema consistent across environments.

BEGIN;

ALTER TABLE pulso_digital
  ADD COLUMN IF NOT EXISTS fuentes_count integer;

UPDATE pulso_digital
SET fuentes_count = 0
WHERE fuentes_count IS NULL;

ALTER TABLE pulso_digital
  ALTER COLUMN fuentes_count SET DEFAULT 0;

ALTER TABLE pulso_digital
  ALTER COLUMN fuentes_count SET NOT NULL;

COMMIT;
