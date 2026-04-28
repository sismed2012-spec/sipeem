-- Migration 011: Historial municipal oficial por ayuntamiento
-- Conserva la fuente oficial municipal separada del detalle seccional.

BEGIN;

CREATE TABLE IF NOT EXISTS historial_municipal_oficial (
  id serial PRIMARY KEY,
  municipio_id integer NOT NULL REFERENCES municipios(id) ON DELETE CASCADE,
  geo_municipio_id integer,
  anio integer NOT NULL,
  total_secciones integer NOT NULL DEFAULT 0,
  total_casillas integer NOT NULL DEFAULT 0,
  total_casillas_mec integer NOT NULL DEFAULT 0,
  lista_nominal integer NOT NULL DEFAULT 0,
  votos_validos integer NOT NULL DEFAULT 0,
  votos_no_registrados integer NOT NULL DEFAULT 0,
  votos_nulos integer NOT NULL DEFAULT 0,
  total_votos integer NOT NULL DEFAULT 0,
  participacion_ciudadana numeric(6,2) NOT NULL DEFAULT 0,
  ganador_siglas text,
  ganador_votacion integer NOT NULL DEFAULT 0,
  ganador_porcentaje numeric(6,2) NOT NULL DEFAULT 0,
  segundo_siglas text,
  segundo_votacion integer NOT NULL DEFAULT 0,
  segundo_porcentaje numeric(6,2) NOT NULL DEFAULT 0,
  margen_votos integer NOT NULL DEFAULT 0,
  margen_porcentual numeric(6,2) NOT NULL DEFAULT 0,
  ruta_acta text,
  fuente text NOT NULL DEFAULT 'import_xlsx_2024_see_ayun_mex_muncand',
  raw_municipio_nombre text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(municipio_id, anio)
);

CREATE TABLE IF NOT EXISTS historial_municipal_oficial_resultados (
  id serial PRIMARY KEY,
  historial_municipal_id integer NOT NULL REFERENCES historial_municipal_oficial(id) ON DELETE CASCADE,
  fuerza text NOT NULL,
  votos integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(historial_municipal_id, fuerza)
);

ALTER TABLE historial_municipal_oficial ENABLE ROW LEVEL SECURITY;
ALTER TABLE historial_municipal_oficial_resultados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "historial_municipal_oficial_select" ON historial_municipal_oficial;
CREATE POLICY "historial_municipal_oficial_select" ON historial_municipal_oficial
  FOR SELECT USING (can_view_municipio(municipio_id));

DROP POLICY IF EXISTS "historial_municipal_oficial_modify" ON historial_municipal_oficial;
CREATE POLICY "historial_municipal_oficial_modify" ON historial_municipal_oficial
  FOR ALL USING (can_edit_municipio(municipio_id))
  WITH CHECK (can_edit_municipio(municipio_id));

DROP POLICY IF EXISTS "historial_municipal_oficial_resultados_select" ON historial_municipal_oficial_resultados;
CREATE POLICY "historial_municipal_oficial_resultados_select" ON historial_municipal_oficial_resultados
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM historial_municipal_oficial h
      WHERE h.id = historial_municipal_oficial_resultados.historial_municipal_id
        AND can_view_municipio(h.municipio_id)
    )
  );

DROP POLICY IF EXISTS "historial_municipal_oficial_resultados_modify" ON historial_municipal_oficial_resultados;
CREATE POLICY "historial_municipal_oficial_resultados_modify" ON historial_municipal_oficial_resultados
  FOR ALL USING (
    EXISTS (
      SELECT 1
      FROM historial_municipal_oficial h
      WHERE h.id = historial_municipal_oficial_resultados.historial_municipal_id
        AND can_edit_municipio(h.municipio_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM historial_municipal_oficial h
      WHERE h.id = historial_municipal_oficial_resultados.historial_municipal_id
        AND can_edit_municipio(h.municipio_id)
    )
  );

CREATE INDEX IF NOT EXISTS idx_historial_municipal_oficial_municipio_anio
  ON historial_municipal_oficial(municipio_id, anio DESC);
CREATE INDEX IF NOT EXISTS idx_historial_municipal_oficial_anio
  ON historial_municipal_oficial(anio);
CREATE INDEX IF NOT EXISTS idx_historial_municipal_oficial_geo
  ON historial_municipal_oficial(geo_municipio_id);
CREATE INDEX IF NOT EXISTS idx_historial_municipal_oficial_resultados_historial
  ON historial_municipal_oficial_resultados(historial_municipal_id);
CREATE INDEX IF NOT EXISTS idx_historial_municipal_oficial_resultados_fuerza
  ON historial_municipal_oficial_resultados(fuerza);

DROP TRIGGER IF EXISTS set_updated_at_historial_municipal_oficial ON historial_municipal_oficial;
CREATE TRIGGER set_updated_at_historial_municipal_oficial
BEFORE UPDATE ON historial_municipal_oficial
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

COMMIT;
