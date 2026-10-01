with
table_reports as (
  select
    'public.cat_estados_evento'::text as table_name,
    count(*)::integer as row_count,
    pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
      coalesce(jsonb_agg(to_jsonb(t) order by t.estado_evento_id), '[]'::jsonb)::text,
      'UTF8'
    ), 'sha256'), 'hex') as rows_sha256
  from public.cat_estados_evento t
  union all
  select
    'public.cat_estados_georreferenciacion',
    count(*)::integer,
    pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
      coalesce(jsonb_agg(to_jsonb(t) order by t.estado_geo_id), '[]'::jsonb)::text,
      'UTF8'
    ), 'sha256'), 'hex')
  from public.cat_estados_georreferenciacion t
  union all
  select
    'public.cat_fuentes_evento',
    count(*)::integer,
    pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
      coalesce(jsonb_agg(to_jsonb(t) order by t.fuente_evento_id), '[]'::jsonb)::text,
      'UTF8'
    ), 'sha256'), 'hex')
  from public.cat_fuentes_evento t
  union all
  select
    'public.cat_niveles_sensibilidad',
    count(*)::integer,
    pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
      coalesce(jsonb_agg(to_jsonb(t) order by t.nivel), '[]'::jsonb)::text,
      'UTF8'
    ), 'sha256'), 'hex')
  from public.cat_niveles_sensibilidad t
  union all
  select
    'public.cat_tipos_asentamiento',
    count(*)::integer,
    pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
      coalesce(jsonb_agg(to_jsonb(t) order by t.tipo_asentamiento_id), '[]'::jsonb)::text,
      'UTF8'
    ), 'sha256'), 'hex')
  from public.cat_tipos_asentamiento t
  union all
  select
    'public.cat_tipos_fuerza_electoral',
    count(*)::integer,
    pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
      coalesce(jsonb_agg(to_jsonb(t) order by t.tipo_fuerza_id), '[]'::jsonb)::text,
      'UTF8'
    ), 'sha256'), 'hex')
  from public.cat_tipos_fuerza_electoral t
),
sequence_reports as (
  select 'public.cat_estados_evento'::text as table_name,
         jsonb_build_array(jsonb_build_object(
           'name', 'public.cat_estados_evento_estado_evento_id_seq',
           'lastValue', s.last_value,
           'isCalled', s.is_called
         )) as value
  from public.cat_estados_evento_estado_evento_id_seq s
  union all
  select 'public.cat_estados_georreferenciacion',
         jsonb_build_array(jsonb_build_object(
           'name', 'public.cat_estados_georreferenciacion_estado_geo_id_seq',
           'lastValue', s.last_value,
           'isCalled', s.is_called
         ))
  from public.cat_estados_georreferenciacion_estado_geo_id_seq s
  union all
  select 'public.cat_fuentes_evento',
         jsonb_build_array(jsonb_build_object(
           'name', 'public.cat_fuentes_evento_fuente_evento_id_seq',
           'lastValue', s.last_value,
           'isCalled', s.is_called
         ))
  from public.cat_fuentes_evento_fuente_evento_id_seq s
  union all
  select 'public.cat_niveles_sensibilidad', '[]'::jsonb
  union all
  select 'public.cat_tipos_asentamiento',
         jsonb_build_array(jsonb_build_object(
           'name', 'public.cat_tipos_asentamiento_tipo_asentamiento_id_seq',
           'lastValue', s.last_value,
           'isCalled', s.is_called
         ))
  from public.cat_tipos_asentamiento_tipo_asentamiento_id_seq s
  union all
  select 'public.cat_tipos_fuerza_electoral',
         jsonb_build_array(jsonb_build_object(
           'name', 'public.cat_tipos_fuerza_electoral_tipo_fuerza_id_seq',
           'lastValue', s.last_value,
           'isCalled', s.is_called
         ))
  from public.cat_tipos_fuerza_electoral_tipo_fuerza_id_seq s
)
select jsonb_build_object(
  'contractVersion', 1,
  'kind', 'promotion_preseeded_catalogs',
  'tables', jsonb_agg(jsonb_build_object(
    'table', t.table_name,
    'rowCount', t.row_count,
    'rowsSha256', t.rows_sha256,
    'sequences', s.value
  ) order by t.table_name)
)
from table_reports t
join sequence_reports s using (table_name);
