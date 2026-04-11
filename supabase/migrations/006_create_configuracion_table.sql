CREATE TABLE configuracion (
  id serial PRIMARY KEY,
  clave text UNIQUE NOT NULL,
  valor text NOT NULL,
  categoria text NOT NULL DEFAULT 'General',
  descripcion text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at_configuracion
BEFORE UPDATE ON configuracion
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

ALTER TABLE configuracion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "configuracion_select" ON configuracion
FOR SELECT
USING (get_user_rol() IS NOT NULL);

CREATE POLICY "configuracion_modify" ON configuracion
FOR ALL
USING (get_user_rol() IN ('director', 'admin'))
WITH CHECK (get_user_rol() IN ('director', 'admin'));

CREATE INDEX idx_configuracion_clave ON configuracion(clave);
CREATE INDEX idx_configuracion_categoria ON configuracion(categoria);
