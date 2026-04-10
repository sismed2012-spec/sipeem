-- ============================================
-- SIPEEM Database Schema
-- ============================================

-- Municipios
CREATE TABLE municipios (
  id serial PRIMARY KEY,
  nombre text UNIQUE NOT NULL,
  color text NOT NULL DEFAULT '#6b7280',
  sec_inicio integer NOT NULL DEFAULT 0,
  secciones integer NOT NULL DEFAULT 0,
  regidores integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Alcaldes
CREATE TABLE alcaldes (
  id serial PRIMARY KEY,
  municipio_id integer NOT NULL REFERENCES municipios(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  partido text NOT NULL DEFAULT '',
  foto_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(municipio_id)
);

-- Datos Electorales
CREATE TABLE datos_electorales (
  id serial PRIMARY KEY,
  municipio_id integer NOT NULL REFERENCES municipios(id) ON DELETE CASCADE,
  nom integer NOT NULL DEFAULT 0,
  padron integer NOT NULL DEFAULT 0,
  votos_totales integer NOT NULL DEFAULT 0,
  votos integer NOT NULL DEFAULT 0,
  dif_votos integer NOT NULL DEFAULT 0,
  dif_pct numeric(5,2) NOT NULL DEFAULT 0,
  participacion numeric(5,2) NOT NULL DEFAULT 0,
  sec_ganadas integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(municipio_id)
);

-- Historial Electoral
CREATE TABLE historial_electoral (
  id serial PRIMARY KEY,
  municipio_id integer NOT NULL REFERENCES municipios(id) ON DELETE CASCADE,
  anio integer NOT NULL,
  partido_ganador text NOT NULL,
  votos integer NOT NULL DEFAULT 0,
  porcentaje numeric(5,2) NOT NULL DEFAULT 0,
  desglose jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(municipio_id, anio)
);

-- Termometros
CREATE TABLE termometros (
  id serial PRIMARY KEY,
  municipio_id integer NOT NULL REFERENCES municipios(id) ON DELETE CASCADE,
  term1 integer NOT NULL DEFAULT 50 CHECK (term1 BETWEEN 0 AND 100),
  term2 integer NOT NULL DEFAULT 50 CHECK (term2 BETWEEN 0 AND 100),
  term3 integer NOT NULL DEFAULT 50 CHECK (term3 BETWEEN 0 AND 100),
  term4 integer NOT NULL DEFAULT 50 CHECK (term4 BETWEEN 0 AND 100),
  term5 integer NOT NULL DEFAULT 50 CHECK (term5 BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(municipio_id)
);

-- Escenarios
CREATE TABLE escenarios (
  id serial PRIMARY KEY,
  municipio_id integer NOT NULL REFERENCES municipios(id) ON DELETE CASCADE,
  e1_comp text NOT NULL DEFAULT '',
  e1_rec text NOT NULL DEFAULT '',
  e2_gen text NOT NULL DEFAULT '',
  e2_atr text NOT NULL DEFAULT '',
  e3_gob text NOT NULL DEFAULT '',
  e3_dem text NOT NULL DEFAULT '',
  e4_niv text NOT NULL DEFAULT '',
  e4_foco text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(municipio_id)
);

-- Comite Municipal
CREATE TABLE comite_municipal (
  id serial PRIMARY KEY,
  municipio_id integer NOT NULL REFERENCES municipios(id) ON DELETE CASCADE,
  presidente text NOT NULL DEFAULT '',
  secretario text NOT NULL DEFAULT '',
  fachada_url text,
  link_maps text,
  inaugurado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(municipio_id)
);

-- Planilla (Cabildo)
CREATE TABLE planilla (
  id serial PRIMARY KEY,
  municipio_id integer NOT NULL REFERENCES municipios(id) ON DELETE CASCADE,
  cargo text NOT NULL,
  nombre text NOT NULL DEFAULT '',
  partido text NOT NULL DEFAULT '',
  foto_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Directorio de Aspirantes
CREATE TABLE directorio_aspirantes (
  id serial PRIMARY KEY,
  municipio_id integer NOT NULL REFERENCES municipios(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  cargo_aspirado text NOT NULL DEFAULT '',
  partido text NOT NULL DEFAULT '',
  fecha_nacimiento date,
  telefono text,
  email text,
  foto_url text,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Usuarios (extends Supabase Auth)
CREATE TABLE usuarios (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  email text NOT NULL,
  rol text NOT NULL DEFAULT 'operador' CHECK (rol IN ('operador', 'analista', 'director')),
  municipios_asignados integer[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- Updated_at trigger
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON municipios FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON alcaldes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON datos_electorales FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON termometros FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON escenarios FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON comite_municipal FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON planilla FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON directorio_aspirantes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON usuarios FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- Indexes
-- ============================================

CREATE INDEX idx_alcaldes_municipio ON alcaldes(municipio_id);
CREATE INDEX idx_datos_electorales_municipio ON datos_electorales(municipio_id);
CREATE INDEX idx_historial_municipio_anio ON historial_electoral(municipio_id, anio);
CREATE INDEX idx_termometros_municipio ON termometros(municipio_id);
CREATE INDEX idx_escenarios_municipio ON escenarios(municipio_id);
CREATE INDEX idx_comite_municipio ON comite_municipal(municipio_id);
CREATE INDEX idx_planilla_municipio ON planilla(municipio_id);
CREATE INDEX idx_directorio_municipio ON directorio_aspirantes(municipio_id);
CREATE INDEX idx_usuarios_rol ON usuarios(rol);
