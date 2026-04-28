-- Migration 018: add resumen to pulso_digital
-- Keeps Pulso Digital schema compatible with current app payload.

BEGIN;

ALTER TABLE pulso_digital
  ADD COLUMN IF NOT EXISTS resumen text;

UPDATE pulso_digital
SET resumen = 'Sin resumen disponible.'
WHERE resumen IS NULL OR btrim(resumen) = '';

ALTER TABLE pulso_digital
  ALTER COLUMN resumen SET DEFAULT 'Sin resumen disponible.';

ALTER TABLE pulso_digital
  ALTER COLUMN resumen SET NOT NULL;

COMMIT;
