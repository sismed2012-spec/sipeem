-- Migration 016: add generado_por to pulso_digital
-- Complements migration 015 to align Pulso Digital schema.

BEGIN;

ALTER TABLE pulso_digital
  ADD COLUMN IF NOT EXISTS generado_por text;

UPDATE pulso_digital
SET generado_por = 'system'
WHERE generado_por IS NULL OR btrim(generado_por) = '';

ALTER TABLE pulso_digital
  ALTER COLUMN generado_por SET DEFAULT 'system';

ALTER TABLE pulso_digital
  ALTER COLUMN generado_por SET NOT NULL;

COMMIT;
