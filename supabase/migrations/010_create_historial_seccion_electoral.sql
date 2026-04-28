-- Migration 010: Historial electoral por seccion
-- Base para importar resultados 2024 a nivel seccional sin romper
-- el historial municipal ya existente.

BEGIN;

CREATE TABLE IF NOT EXISTS historial_seccion_electoral (
  id serial PRIMARY KEY,
  anio integer NOT NULL,
  municipio_id integer NOT NULL REFERENCES municipios(id) ON DELETE CASCADE,
  seccion_numero integer NOT NULL,
  seccion_id integer,
  geo_municipio_id integer,
  id_distrito_local integer,
  cabecera_distrital_local text,
  casillas integer NOT NULL DEFAULT 0,
  actas_casilla_mec integer NOT NULL DEFAULT 0,
  num_votos_validos integer NOT NULL DEFAULT 0,
  num_votos_can_nreg integer NOT NULL DEFAULT 0,
  num_votos_nulos integer NOT NULL DEFAULT 0,
  total_votos integer NOT NULL DEFAULT 0,
  lista_nominal integer,
  fuente text NOT NULL DEFAULT 'import_xlsx_2024_see_ayun_mex_sec',
  raw_municipio_nombre text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(anio, municipio_id, seccion_numero)
);

CREATE TABLE IF NOT EXISTS historial_seccion_resultados (
  id serial PRIMARY KEY,
  historial_seccion_id integer NOT NULL REFERENCES historial_seccion_electoral(id) ON DELETE CASCADE,
  fuerza text NOT NULL,
  votos integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(historial_seccion_id, fuerza)
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'secciones'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'historial_seccion_electoral'
      AND constraint_name = 'historial_seccion_electoral_seccion_id_fkey'
  ) THEN
    ALTER TABLE historial_seccion_electoral
      ADD CONSTRAINT historial_seccion_electoral_seccion_id_fkey
      FOREIGN KEY (seccion_id) REFERENCES secciones(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE historial_seccion_electoral ENABLE ROW LEVEL SECURITY;
ALTER TABLE historial_seccion_resultados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "historial_seccion_select" ON historial_seccion_electoral;
CREATE POLICY "historial_seccion_select" ON historial_seccion_electoral
  FOR SELECT USING (can_view_municipio(municipio_id));

DROP POLICY IF EXISTS "historial_seccion_modify" ON historial_seccion_electoral;
CREATE POLICY "historial_seccion_modify" ON historial_seccion_electoral
  FOR ALL USING (can_edit_municipio(municipio_id))
  WITH CHECK (can_edit_municipio(municipio_id));

DROP POLICY IF EXISTS "historial_seccion_resultados_select" ON historial_seccion_resultados;
CREATE POLICY "historial_seccion_resultados_select" ON historial_seccion_resultados
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM historial_seccion_electoral h
      WHERE h.id = historial_seccion_resultados.historial_seccion_id
        AND can_view_municipio(h.municipio_id)
    )
  );

DROP POLICY IF EXISTS "historial_seccion_resultados_modify" ON historial_seccion_resultados;
CREATE POLICY "historial_seccion_resultados_modify" ON historial_seccion_resultados
  FOR ALL USING (
    EXISTS (
      SELECT 1
      FROM historial_seccion_electoral h
      WHERE h.id = historial_seccion_resultados.historial_seccion_id
        AND can_edit_municipio(h.municipio_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM historial_seccion_electoral h
      WHERE h.id = historial_seccion_resultados.historial_seccion_id
        AND can_edit_municipio(h.municipio_id)
    )
  );

CREATE INDEX IF NOT EXISTS idx_historial_seccion_municipio_anio
  ON historial_seccion_electoral(municipio_id, anio DESC);
CREATE INDEX IF NOT EXISTS idx_historial_seccion_anio
  ON historial_seccion_electoral(anio);
CREATE INDEX IF NOT EXISTS idx_historial_seccion_geo_municipio
  ON historial_seccion_electoral(geo_municipio_id);
CREATE INDEX IF NOT EXISTS idx_historial_seccion_numero
  ON historial_seccion_electoral(seccion_numero);
CREATE INDEX IF NOT EXISTS idx_historial_seccion_resultados_historial
  ON historial_seccion_resultados(historial_seccion_id);
CREATE INDEX IF NOT EXISTS idx_historial_seccion_resultados_fuerza
  ON historial_seccion_resultados(fuerza);

DROP TRIGGER IF EXISTS set_updated_at_historial_seccion ON historial_seccion_electoral;
CREATE TRIGGER set_updated_at_historial_seccion
BEFORE UPDATE ON historial_seccion_electoral
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

COMMIT;
