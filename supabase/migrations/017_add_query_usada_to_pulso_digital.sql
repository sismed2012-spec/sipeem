-- Migration 017: add query_usada to pulso_digital
-- Aligns Pulso Digital table with current application writes.

BEGIN;

ALTER TABLE pulso_digital
  ADD COLUMN IF NOT EXISTS query_usada text;

UPDATE pulso_digital
SET query_usada = 'consulta_general'
WHERE query_usada IS NULL OR btrim(query_usada) = '';

ALTER TABLE pulso_digital
  ALTER COLUMN query_usada SET DEFAULT 'consulta_general';

ALTER TABLE pulso_digital
  ALTER COLUMN query_usada SET NOT NULL;

COMMIT;
