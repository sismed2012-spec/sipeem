BEGIN;

CREATE TABLE IF NOT EXISTS secciones_objetivo (
  id bigserial PRIMARY KEY,
  municipio_id integer NOT NULL REFERENCES municipios(id) ON DELETE CASCADE,
  seccion_id integer NOT NULL REFERENCES secciones(id) ON DELETE CASCADE,
  prioridad text NOT NULL DEFAULT 'Alta',
  score_snapshot integer,
  source text NOT NULL DEFAULT 'historial_prioridad',
  anio integer,
  notas text,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (municipio_id, seccion_id)
);

ALTER TABLE secciones_objetivo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "secciones_objetivo_select" ON secciones_objetivo;
CREATE POLICY "secciones_objetivo_select" ON secciones_objetivo
  FOR SELECT USING (can_view_municipio(municipio_id));

DROP POLICY IF EXISTS "secciones_objetivo_modify" ON secciones_objetivo;
CREATE POLICY "secciones_objetivo_modify" ON secciones_objetivo
  FOR ALL USING (can_edit_municipio(municipio_id))
  WITH CHECK (can_edit_municipio(municipio_id));

CREATE INDEX IF NOT EXISTS idx_secciones_objetivo_municipio
  ON secciones_objetivo (municipio_id, prioridad, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_secciones_objetivo_seccion
  ON secciones_objetivo (seccion_id);

DROP TRIGGER IF EXISTS set_updated_at_secciones_objetivo ON secciones_objetivo;
CREATE TRIGGER set_updated_at_secciones_objetivo
BEFORE UPDATE ON secciones_objetivo
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

COMMIT;
