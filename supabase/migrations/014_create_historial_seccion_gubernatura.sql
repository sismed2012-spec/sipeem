-- Migration 014: Historial electoral por sección — Gubernatura
-- Tabla dedicada para resultados de elección de Gobernador por sección,
-- separada del historial municipal para evitar contaminación en consistencia.

BEGIN;

CREATE TABLE IF NOT EXISTS historial_seccion_gubernatura (
  id serial PRIMARY KEY,
  anio integer NOT NULL,
  municipio_id integer NOT NULL REFERENCES municipios(id) ON DELETE CASCADE,
  geo_municipio_id integer,
  seccion_numero integer NOT NULL,
  id_distrito_local integer,
  cabecera_distrital_local text,
  casillas integer NOT NULL DEFAULT 0,
  num_votos_validos integer NOT NULL DEFAULT 0,
  num_votos_can_nreg integer NOT NULL DEFAULT 0,
  num_votos_nulos integer NOT NULL DEFAULT 0,
  total_votos integer NOT NULL DEFAULT 0,
  lista_nominal integer,
  fuente text NOT NULL DEFAULT 'import_xlsx_gubernatura',
  raw_municipio_nombre text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(anio, municipio_id, seccion_numero)
);

CREATE TABLE IF NOT EXISTS historial_seccion_gubernatura_resultados (
  id serial PRIMARY KEY,
  historial_seccion_gubernatura_id integer NOT NULL
    REFERENCES historial_seccion_gubernatura(id) ON DELETE CASCADE,
  fuerza text NOT NULL,
  votos integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(historial_seccion_gubernatura_id, fuerza)
);

ALTER TABLE historial_seccion_gubernatura ENABLE ROW LEVEL SECURITY;
ALTER TABLE historial_seccion_gubernatura_resultados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "historial_seccion_gub_select" ON historial_seccion_gubernatura;
CREATE POLICY "historial_seccion_gub_select" ON historial_seccion_gubernatura
  FOR SELECT USING (can_view_municipio(municipio_id));

DROP POLICY IF EXISTS "historial_seccion_gub_modify" ON historial_seccion_gubernatura;
CREATE POLICY "historial_seccion_gub_modify" ON historial_seccion_gubernatura
  FOR ALL USING (can_edit_municipio(municipio_id))
  WITH CHECK (can_edit_municipio(municipio_id));

DROP POLICY IF EXISTS "historial_seccion_gub_res_select" ON historial_seccion_gubernatura_resultados;
CREATE POLICY "historial_seccion_gub_res_select" ON historial_seccion_gubernatura_resultados
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM historial_seccion_gubernatura h
      WHERE h.id = historial_seccion_gubernatura_resultados.historial_seccion_gubernatura_id
        AND can_view_municipio(h.municipio_id)
    )
  );

DROP POLICY IF EXISTS "historial_seccion_gub_res_modify" ON historial_seccion_gubernatura_resultados;
CREATE POLICY "historial_seccion_gub_res_modify" ON historial_seccion_gubernatura_resultados
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM historial_seccion_gubernatura h
      WHERE h.id = historial_seccion_gubernatura_resultados.historial_seccion_gubernatura_id
        AND can_edit_municipio(h.municipio_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM historial_seccion_gubernatura h
      WHERE h.id = historial_seccion_gubernatura_resultados.historial_seccion_gubernatura_id
        AND can_edit_municipio(h.municipio_id)
    )
  );

CREATE INDEX IF NOT EXISTS idx_hsg_municipio_anio
  ON historial_seccion_gubernatura(municipio_id, anio DESC);
CREATE INDEX IF NOT EXISTS idx_hsg_anio
  ON historial_seccion_gubernatura(anio);
CREATE INDEX IF NOT EXISTS idx_hsg_geo_municipio
  ON historial_seccion_gubernatura(geo_municipio_id);
CREATE INDEX IF NOT EXISTS idx_hsg_seccion_numero
  ON historial_seccion_gubernatura(seccion_numero);
CREATE INDEX IF NOT EXISTS idx_hsg_resultados_parent
  ON historial_seccion_gubernatura_resultados(historial_seccion_gubernatura_id);
CREATE INDEX IF NOT EXISTS idx_hsg_resultados_fuerza
  ON historial_seccion_gubernatura_resultados(fuerza);

DROP TRIGGER IF EXISTS set_updated_at_historial_seccion_gub ON historial_seccion_gubernatura;
CREATE TRIGGER set_updated_at_historial_seccion_gub
BEFORE UPDATE ON historial_seccion_gubernatura
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

COMMIT;
