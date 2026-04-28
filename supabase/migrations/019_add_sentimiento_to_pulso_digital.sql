-- Migration 019: add sentimiento to pulso_digital
-- Ensures sentiment field exists for Pulso Digital writes.

BEGIN;

ALTER TABLE pulso_digital
  ADD COLUMN IF NOT EXISTS sentimiento text;

UPDATE pulso_digital
SET sentimiento = 'neutro'
WHERE sentimiento IS NULL OR btrim(sentimiento) = '';

ALTER TABLE pulso_digital
  ALTER COLUMN sentimiento SET DEFAULT 'neutro';

ALTER TABLE pulso_digital
  ALTER COLUMN sentimiento SET NOT NULL;

COMMIT;
