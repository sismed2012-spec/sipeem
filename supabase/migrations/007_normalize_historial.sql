-- Migration 007: Normalize Historial Electoral (Corrected & Hardened)
-- Transition from a flat JSON model to a relational structure.

BEGIN;

-- 1. Prepare historial_electoral table enhancements
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'historial_electoral'
      AND column_name = 'votos'
  ) THEN
    ALTER TABLE historial_electoral RENAME COLUMN votos TO votos_ganador;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'historial_electoral'
      AND column_name = 'porcentaje'
  ) THEN
    ALTER TABLE historial_electoral RENAME COLUMN porcentaje TO porcentaje_ganador;
  END IF;
END $$;
ALTER TABLE historial_electoral ADD COLUMN IF NOT EXISTS partido_ganador_id integer REFERENCES partidos(id);
ALTER TABLE historial_electoral ADD COLUMN IF NOT EXISTS fuente text;
ALTER TABLE historial_electoral ADD COLUMN IF NOT EXISTS notas text;
ALTER TABLE historial_electoral ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 2. Create the detailed results table
CREATE TABLE IF NOT EXISTS historial_electoral_resultados (
  id serial PRIMARY KEY,
  historial_id integer NOT NULL REFERENCES historial_electoral(id) ON DELETE CASCADE,
  partido_id integer NOT NULL REFERENCES partidos(id),
  votos integer NOT NULL DEFAULT 0,
  porcentaje numeric(5,2) NOT NULL DEFAULT 0,
  posicion integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(historial_id, partido_id)
);

-- 3. Data Migration: Populate the new relational structure from existing data
-- Attempting to map string partido_ganador to partido_id
UPDATE historial_electoral h
SET partido_ganador_id = p.id
FROM partidos p
WHERE UPPER(TRIM(h.partido_ganador)) = UPPER(TRIM(p.siglas)) 
   OR UPPER(TRIM(h.partido_ganador)) = UPPER(TRIM(p.nombre));

-- Relational insertion with percentage calculation and position assignment
-- We use a CTE to safely expand the JSON and calculate totals per event
WITH raw_items AS (
  SELECT
    h.id as h_id,
    p.id as p_id,
    (item->>'v')::integer as v
  FROM historial_electoral h
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(h.desglose, '[]'::jsonb)) AS item
  JOIN partidos p
    ON UPPER(TRIM(item->>'p')) = UPPER(TRIM(p.siglas))
    OR UPPER(TRIM(item->>'p')) = UPPER(TRIM(p.nombre))
),
event_totals AS (
  SELECT h_id, SUM(v) as total_votos
  FROM raw_items
  GROUP BY h_id
),
ranked_items AS (
  SELECT
    r.h_id,
    r.p_id,
    r.v,
    ROUND(
      CASE
        WHEN e.total_votos > 0 THEN (r.v::numeric / e.total_votos::numeric) * 100
        ELSE 0
      END
    , 2) as calculated_pct,
    ROW_NUMBER() OVER (
      PARTITION BY r.h_id
      ORDER BY r.v DESC, r.p_id ASC
    ) as pos
  FROM raw_items r
  JOIN event_totals e ON r.h_id = e.h_id
)
INSERT INTO historial_electoral_resultados (historial_id, partido_id, votos, porcentaje, posicion)
SELECT h_id, p_id, v, calculated_pct, pos
FROM ranked_items
ON CONFLICT (historial_id, partido_id) DO NOTHING;

-- 4. Security: RLS Policies
ALTER TABLE historial_electoral_resultados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "historial_resultados_select" ON historial_electoral_resultados;
CREATE POLICY "historial_resultados_select" ON historial_electoral_resultados
  FOR SELECT USING (get_user_rol() IS NOT NULL);

DROP POLICY IF EXISTS "historial_resultados_modify" ON historial_electoral_resultados;
CREATE POLICY "historial_resultados_modify" ON historial_electoral_resultados
  FOR ALL USING (get_user_rol() IN ('director', 'admin'))
  WITH CHECK (get_user_rol() IN ('director', 'admin'));

-- 5. Performance: Indices
CREATE INDEX IF NOT EXISTS idx_historial_resultados_id ON historial_electoral_resultados(historial_id);
CREATE INDEX IF NOT EXISTS idx_historial_resultados_partido ON historial_electoral_resultados(partido_id);
CREATE INDEX IF NOT EXISTS idx_historial_partido_ganador ON historial_electoral(partido_ganador_id);
CREATE INDEX IF NOT EXISTS idx_historial_municipio_anio ON historial_electoral(municipio_id, anio DESC);
CREATE INDEX IF NOT EXISTS idx_historial_anio ON historial_electoral(anio);

-- 6. Trigger for updated_at
DROP TRIGGER IF EXISTS set_updated_at_historial ON historial_electoral;
CREATE TRIGGER set_updated_at_historial
BEFORE UPDATE ON historial_electoral
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

COMMIT;

-- ============================================================================
-- VALIDACION POST-MIGRACION (Queries para control de calidad)
-- ============================================================================

-- 1. Detectar registros de historial donde NO se pudo resolver el ID del partido ganador
-- SELECT id, municipio_id, anio, partido_ganador as valor_original 
-- FROM historial_electoral 
-- WHERE partido_ganador_id IS NULL;

-- 2. Detectar historiales que tienen desglose JSON pero NO tienen filas en la tabla relacional
-- SELECT h.id, h.municipio_id, h.anio 
-- FROM historial_electoral h
-- LEFT JOIN historial_electoral_resultados r ON h.id = r.historial_id
-- WHERE h.desglose != '[]'::jsonb AND r.id IS NULL;
