create table public.cat_tipos_asentamiento (
  tipo_asentamiento_id smallint generated always as identity primary key,
  codigo text not null unique,
  nombre text not null,
  activo boolean not null default true,
  constraint cat_tipos_asentamiento_codigo_formato_ck
    check (codigo = upper(codigo) and codigo ~ '^[A-Z_]+$')
);

create table public.cat_fuentes_evento (
  fuente_evento_id smallint generated always as identity primary key,
  codigo text not null unique,
  nombre text not null,
  requiere_id_externo boolean not null default false,
  activo boolean not null default true,
  constraint cat_fuentes_evento_codigo_formato_ck
    check (codigo = upper(codigo) and codigo ~ '^[A-Z_]+$')
);

create table public.cat_estados_evento (
  estado_evento_id smallint generated always as identity primary key,
  codigo text not null unique,
  nombre text not null,
  es_final boolean not null default false,
  activo boolean not null default true,
  constraint cat_estados_evento_codigo_formato_ck
    check (codigo = upper(codigo) and codigo ~ '^[A-Z_]+$')
);

create table public.cat_estados_georreferenciacion (
  estado_geo_id smallint generated always as identity primary key,
  codigo text not null unique,
  nombre text not null,
  activo boolean not null default true,
  constraint cat_estados_georreferenciacion_codigo_formato_ck
    check (codigo = upper(codigo) and codigo ~ '^[A-Z_]+$')
);

create table public.cat_niveles_sensibilidad (
  nivel smallint primary key,
  codigo text not null unique,
  nombre text not null,
  descripcion text,
  constraint cat_niveles_sensibilidad_rango_ck check (nivel between 0 and 3),
  constraint cat_niveles_sensibilidad_codigo_formato_ck
    check (codigo = upper(codigo) and codigo ~ '^[A-Z_]+$')
);

insert into public.cat_tipos_asentamiento (codigo, nombre)
values
  ('COLONIA', 'Colonia'),
  ('LOCALIDAD', 'Localidad'),
  ('BARRIO', 'Barrio'),
  ('PUEBLO', 'Pueblo');

insert into public.cat_fuentes_evento (codigo, nombre, requiere_id_externo)
values
  ('MANUAL', 'Captura manual', false),
  ('WHATSAPP', 'WhatsApp', true),
  ('BRIGADA', 'Brigada territorial', true),
  ('FORMULARIO', 'Formulario', true),
  ('ENCUESTA', 'Encuesta', true),
  ('MEDIO', 'Medio de comunicación', true),
  ('RED_SOCIAL', 'Red social', true);

insert into public.cat_estados_evento (codigo, nombre, es_final)
values
  ('RECIBIDO', 'Recibido', false),
  ('VALIDADO', 'Validado', false),
  ('EN_ANALISIS', 'En análisis', false),
  ('ATENDIDO', 'Atendido', true),
  ('DESCARTADO', 'Descartado', true);

insert into public.cat_estados_georreferenciacion (codigo, nombre)
values
  ('SIN_DATOS', 'Sin datos geográficos'),
  ('PENDIENTE_REVISION', 'Pendiente de revisión'),
  ('GPS', 'Resuelto por GPS'),
  ('GEOCODIFICADO', 'Resuelto por geocodificación'),
  ('INFERIDO', 'Inferido desde texto'),
  ('VALIDADO', 'Validado por una persona');

insert into public.cat_niveles_sensibilidad (nivel, codigo, nombre, descripcion)
values
  (0, 'PUBLICO_INTERNO', 'Público interno', 'Cartografía e indicadores públicos agregados'),
  (1, 'OPERATIVO', 'Operativo', 'Incidencias, visitas, estatus y acciones'),
  (2, 'SENSIBLE', 'Sensible', 'Actores, contactos y análisis estratégico'),
  (3, 'RESTRINGIDO', 'Restringido', 'Estrategia, datos personales y análisis ejecutivo');

alter table public.cat_tipos_asentamiento enable row level security;
alter table public.cat_fuentes_evento enable row level security;
alter table public.cat_estados_evento enable row level security;
alter table public.cat_estados_georreferenciacion enable row level security;
alter table public.cat_niveles_sensibilidad enable row level security;

revoke all on table
  public.cat_tipos_asentamiento,
  public.cat_fuentes_evento,
  public.cat_estados_evento,
  public.cat_estados_georreferenciacion,
  public.cat_niveles_sensibilidad
from anon, authenticated;

grant select on table
  public.cat_tipos_asentamiento,
  public.cat_fuentes_evento,
  public.cat_estados_evento,
  public.cat_estados_georreferenciacion,
  public.cat_niveles_sensibilidad
to service_role;

revoke all on sequence
  public.cat_tipos_asentamiento_tipo_asentamiento_id_seq,
  public.cat_fuentes_evento_fuente_evento_id_seq,
  public.cat_estados_evento_estado_evento_id_seq,
  public.cat_estados_georreferenciacion_estado_geo_id_seq
from anon, authenticated;

grant usage, select on sequence
  public.cat_tipos_asentamiento_tipo_asentamiento_id_seq,
  public.cat_fuentes_evento_fuente_evento_id_seq,
  public.cat_estados_evento_estado_evento_id_seq,
  public.cat_estados_georreferenciacion_estado_geo_id_seq
to service_role;

;
