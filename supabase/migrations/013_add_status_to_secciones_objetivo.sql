BEGIN;

ALTER TABLE secciones_objetivo
ADD COLUMN IF NOT EXISTS estatus text NOT NULL DEFAULT 'Pendiente';

ALTER TABLE secciones_objetivo
DROP CONSTRAINT IF EXISTS secciones_objetivo_estatus_check;

ALTER TABLE secciones_objetivo
ADD CONSTRAINT secciones_objetivo_estatus_check
CHECK (estatus IN ('Pendiente', 'En seguimiento', 'Atendida', 'Descartada'));

CREATE INDEX IF NOT EXISTS idx_secciones_objetivo_estatus
  ON secciones_objetivo (estatus, prioridad);

COMMIT;
