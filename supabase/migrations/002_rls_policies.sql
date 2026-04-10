-- ============================================
-- Row Level Security Policies
-- ============================================

-- Helper function: get current user's role
CREATE OR REPLACE FUNCTION get_user_rol()
RETURNS text AS $$
  SELECT rol FROM usuarios WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: get current user's assigned municipalities
CREATE OR REPLACE FUNCTION get_user_municipios()
RETURNS integer[] AS $$
  SELECT municipios_asignados FROM usuarios WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: check if user can view a municipality
CREATE OR REPLACE FUNCTION can_view_municipio(mun_id integer)
RETURNS boolean AS $$
  SELECT CASE
    WHEN get_user_rol() IN ('director', 'analista') THEN true
    WHEN get_user_rol() = 'operador' THEN mun_id = ANY(get_user_municipios())
    ELSE false
  END;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: check if user can edit a municipality
CREATE OR REPLACE FUNCTION can_edit_municipio(mun_id integer)
RETURNS boolean AS $$
  SELECT CASE
    WHEN get_user_rol() = 'director' THEN false
    WHEN get_user_rol() IN ('analista', 'operador') THEN mun_id = ANY(get_user_municipios())
    ELSE false
  END;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Enable RLS on all tables
ALTER TABLE municipios ENABLE ROW LEVEL SECURITY;
ALTER TABLE alcaldes ENABLE ROW LEVEL SECURITY;
ALTER TABLE datos_electorales ENABLE ROW LEVEL SECURITY;
ALTER TABLE historial_electoral ENABLE ROW LEVEL SECURITY;
ALTER TABLE termometros ENABLE ROW LEVEL SECURITY;
ALTER TABLE escenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE comite_municipal ENABLE ROW LEVEL SECURITY;
ALTER TABLE planilla ENABLE ROW LEVEL SECURITY;
ALTER TABLE directorio_aspirantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;

-- ============================================
-- MUNICIPIOS: everyone reads based on role, no direct edit
-- ============================================
CREATE POLICY "municipios_select" ON municipios FOR SELECT USING (
  CASE
    WHEN get_user_rol() IN ('director', 'analista') THEN true
    WHEN get_user_rol() = 'operador' THEN id = ANY(get_user_municipios())
    ELSE false
  END
);

-- ============================================
-- Macro for child tables: SELECT by can_view, UPDATE/INSERT/DELETE by can_edit
-- Applied to: alcaldes, datos_electorales, historial_electoral, termometros,
--             escenarios, comite_municipal, planilla, directorio_aspirantes
-- ============================================

-- ALCALDES
CREATE POLICY "alcaldes_select" ON alcaldes FOR SELECT USING (can_view_municipio(municipio_id));
CREATE POLICY "alcaldes_insert" ON alcaldes FOR INSERT WITH CHECK (can_edit_municipio(municipio_id));
CREATE POLICY "alcaldes_update" ON alcaldes FOR UPDATE USING (can_edit_municipio(municipio_id));
CREATE POLICY "alcaldes_delete" ON alcaldes FOR DELETE USING (can_edit_municipio(municipio_id));

-- DATOS ELECTORALES
CREATE POLICY "datos_electorales_select" ON datos_electorales FOR SELECT USING (can_view_municipio(municipio_id));
CREATE POLICY "datos_electorales_insert" ON datos_electorales FOR INSERT WITH CHECK (can_edit_municipio(municipio_id));
CREATE POLICY "datos_electorales_update" ON datos_electorales FOR UPDATE USING (can_edit_municipio(municipio_id));
CREATE POLICY "datos_electorales_delete" ON datos_electorales FOR DELETE USING (can_edit_municipio(municipio_id));

-- HISTORIAL ELECTORAL
CREATE POLICY "historial_select" ON historial_electoral FOR SELECT USING (can_view_municipio(municipio_id));
CREATE POLICY "historial_insert" ON historial_electoral FOR INSERT WITH CHECK (can_edit_municipio(municipio_id));
CREATE POLICY "historial_update" ON historial_electoral FOR UPDATE USING (can_edit_municipio(municipio_id));
CREATE POLICY "historial_delete" ON historial_electoral FOR DELETE USING (can_edit_municipio(municipio_id));

-- TERMOMETROS
CREATE POLICY "termometros_select" ON termometros FOR SELECT USING (can_view_municipio(municipio_id));
CREATE POLICY "termometros_insert" ON termometros FOR INSERT WITH CHECK (can_edit_municipio(municipio_id));
CREATE POLICY "termometros_update" ON termometros FOR UPDATE USING (can_edit_municipio(municipio_id));
CREATE POLICY "termometros_delete" ON termometros FOR DELETE USING (can_edit_municipio(municipio_id));

-- ESCENARIOS
CREATE POLICY "escenarios_select" ON escenarios FOR SELECT USING (can_view_municipio(municipio_id));
CREATE POLICY "escenarios_insert" ON escenarios FOR INSERT WITH CHECK (can_edit_municipio(municipio_id));
CREATE POLICY "escenarios_update" ON escenarios FOR UPDATE USING (can_edit_municipio(municipio_id));
CREATE POLICY "escenarios_delete" ON escenarios FOR DELETE USING (can_edit_municipio(municipio_id));

-- COMITE MUNICIPAL
CREATE POLICY "comite_select" ON comite_municipal FOR SELECT USING (can_view_municipio(municipio_id));
CREATE POLICY "comite_insert" ON comite_municipal FOR INSERT WITH CHECK (can_edit_municipio(municipio_id));
CREATE POLICY "comite_update" ON comite_municipal FOR UPDATE USING (can_edit_municipio(municipio_id));
CREATE POLICY "comite_delete" ON comite_municipal FOR DELETE USING (can_edit_municipio(municipio_id));

-- PLANILLA
CREATE POLICY "planilla_select" ON planilla FOR SELECT USING (can_view_municipio(municipio_id));
CREATE POLICY "planilla_insert" ON planilla FOR INSERT WITH CHECK (can_edit_municipio(municipio_id));
CREATE POLICY "planilla_update" ON planilla FOR UPDATE USING (can_edit_municipio(municipio_id));
CREATE POLICY "planilla_delete" ON planilla FOR DELETE USING (can_edit_municipio(municipio_id));

-- DIRECTORIO ASPIRANTES
CREATE POLICY "directorio_select" ON directorio_aspirantes FOR SELECT USING (can_view_municipio(municipio_id));
CREATE POLICY "directorio_insert" ON directorio_aspirantes FOR INSERT WITH CHECK (can_edit_municipio(municipio_id));
CREATE POLICY "directorio_update" ON directorio_aspirantes FOR UPDATE USING (can_edit_municipio(municipio_id));
CREATE POLICY "directorio_delete" ON directorio_aspirantes FOR DELETE USING (can_edit_municipio(municipio_id));

-- ============================================
-- USUARIOS: users can read own profile, directors can read all
-- ============================================
CREATE POLICY "usuarios_select_own" ON usuarios FOR SELECT USING (
  id = auth.uid() OR get_user_rol() = 'director'
);
CREATE POLICY "usuarios_update_own" ON usuarios FOR UPDATE USING (
  id = auth.uid()
);

-- ============================================
-- Storage bucket policies (run in Supabase dashboard > Storage)
-- ============================================
-- Create bucket "fotos" with public access disabled
-- Policy: authenticated users can upload to fotos/{municipio_id}/*
-- Policy: authenticated users can read from fotos/* if they can view the municipio
