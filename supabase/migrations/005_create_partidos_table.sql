CREATE TABLE partidos (
  id serial PRIMARY KEY,
  nombre text UNIQUE NOT NULL,
  siglas text UNIQUE NOT NULL,
  color text NOT NULL DEFAULT '#6b7280',
  estatus text NOT NULL DEFAULT 'activo' CHECK (estatus IN ('activo', 'inactivo')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at_partidos
BEFORE UPDATE ON partidos
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

ALTER TABLE partidos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partidos_select" ON partidos
FOR SELECT
USING (get_user_rol() IS NOT NULL);

CREATE POLICY "partidos_modify" ON partidos
FOR ALL
USING (get_user_rol() IN ('director', 'admin'))
WITH CHECK (get_user_rol() IN ('director', 'admin'));

CREATE INDEX idx_partidos_siglas ON partidos(siglas);
CREATE INDEX idx_partidos_estatus ON partidos(estatus);