with
territorial_counts as (
  select jsonb_build_object(
    'cartographyVersions', (select count(*) from public.cartografia_versiones),
    'sections', (select count(*) from public.territorios_secciones),
    'municipalities', (select count(*) from public.territorios_municipios),
    'localDistricts', (select count(*) from public.territorios_distritos_locales),
    'federalDistricts', (select count(*) from public.territorios_distritos_federales),
    'ecegSections', (select count(*) from public.demografia_eceg_secciones),
    'nominalRows', (select count(*) from public.lista_nominal_secciones)
  ) as value
),
source_states as (
  select jsonb_build_object(
    'demographic', coalesce((
      select jsonb_agg(
        jsonb_build_object('sha256', archivo_sha256, 'state', estado)
        order by archivo_sha256
      )
      from public.demografia_fuentes
    ), '[]'::jsonb),
    'nominal', coalesce((
      select jsonb_agg(
        jsonb_build_object('sha256', archivo_sha256, 'state', estado)
        order by archivo_sha256
      )
      from public.lista_nominal_cortes
    ), '[]'::jsonb)
  ) as value
),
all_geometries as (
  select geom from public.cartografia_municipios
  union all select geom from public.cartografia_distritos_locales
  union all select geom from public.cartografia_distritos_federales
  union all select geom from public.cartografia_secciones
  union all select geom from public.cartografia_colonias
  union all select geom_punto from public.cartografia_localidades
  union all select geom_limite from public.cartografia_localidades
  union all select geom from public.cartografia_limites_localidad
),
geometry_report as (
  select jsonb_build_object(
    'srids', coalesce(jsonb_agg(distinct extensions.st_srid(geom)) filter (where geom is not null), '[]'::jsonb),
    'nullGeometries', count(*) filter (where geom is null),
    'invalidGeometries', count(*) filter (where geom is not null and not extensions.st_isvalid(geom))
  ) as value
  from all_geometries
),
correspondence_report as (
  select jsonb_build_object(
    'eceg', coalesce((
      select jsonb_object_agg(estado, total order by estado)
      from (
        select estado, count(*) as total
        from public.demografia_eceg_correspondencias
        group by estado
      ) grouped
    ), '{}'::jsonb),
    'nominal', coalesce((
      select jsonb_object_agg(estado, total order by estado)
      from (
        select estado, count(*) as total
        from public.lista_nominal_correspondencias
        group by estado
      ) grouped
    ), '{}'::jsonb)
  ) as value
),
required_rpc(signature) as (
  values
    ('public.rpc_get_seccion(double precision,double precision)'),
    ('public.rpc_resolver_territorio(double precision,double precision)'),
    ('public.rpc_get_seccion_contexto(bigint)'),
    ('public.rpc_resumen_cobertura_colonias(bigint)'),
    ('public.rpc_lista_nominal_seccion(bigint,bigint,date)'),
    ('public.rpc_indicadores_territoriales(text,bigint,bigint,bigint)')
),
rpc_report as (
  select jsonb_build_object(
    'missing', coalesce(jsonb_agg(signature order by signature) filter (
      where pg_catalog.to_regprocedure(signature) is null
    ), '[]'::jsonb)
  ) as value
  from required_rpc
),
rls_violations as (
  select coalesce(jsonb_agg(c.relname order by c.relname), '[]'::jsonb) as value
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
),
privilege_violations as (
  select coalesce(
    jsonb_agg(jsonb_build_object('table', table_name, 'privilege', privilege_type) order by table_name, privilege_type),
    '[]'::jsonb
  ) as value
  from information_schema.role_table_grants
  where table_schema in ('public', 'territorial_private') and grantee = 'PUBLIC'
),
function_violations as (
  select coalesce(
    jsonb_agg(pg_catalog.format('%I.%I', n.nspname, p.proname) order by n.nspname, p.proname),
    '[]'::jsonb
  ) as value
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'territorial_private')
    and p.prosecdef
    and (
      not exists (
        select 1 from unnest(coalesce(p.proconfig, array[]::text[])) setting
        where setting like 'search_path=%'
      )
      or pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE')
    )
),
security_report as (
  select jsonb_build_object(
    'rlsViolations', rls_violations.value,
    'privilegeViolations', privilege_violations.value,
    'functionViolations', function_violations.value
  ) as value
  from rls_violations, privilege_violations, function_violations
),
operational_names(object_name) as (
  values
    ('public.municipios'), ('public.alcaldes'), ('public.usuarios'),
    ('public.roles'), ('public.configuracion'), ('public.escenarios'),
    ('public.estrategia_municipal'), ('public.secciones_objetivo')
),
operational_report as (
  select coalesce(jsonb_agg(object_name order by object_name), '[]'::jsonb) as value
  from operational_names
  where pg_catalog.to_regclass(object_name) is not null
),
advisor_ready_checks as (
  select jsonb_build_object(
    'securityCritical', jsonb_array_length(rls_violations.value) + jsonb_array_length(privilege_violations.value) + jsonb_array_length(function_violations.value),
    'performanceCritical', (select count(*) from pg_catalog.pg_index where not indisvalid)
  ) as value
  from rls_violations, privilege_violations, function_violations
)
select jsonb_build_object(
  'contractVersion', 1,
  'kind', 'promotion_postflight',
  'counts', territorial_counts.value,
  'sources', source_states.value,
  'geometries', geometry_report.value,
  'correspondences', correspondence_report.value,
  'rpc', rpc_report.value,
  'security', security_report.value,
  'operationalObjects', operational_report.value,
  'advisorReadiness', advisor_ready_checks.value
)
from territorial_counts, source_states, geometry_report, correspondence_report,
     rpc_report, security_report, operational_report, advisor_ready_checks;
