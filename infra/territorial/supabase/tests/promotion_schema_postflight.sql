with
migration_history as (
  select coalesce(jsonb_agg(m.version::text order by m.version::text), '[]'::jsonb) as value
  from supabase_migrations.schema_migrations m
),
extension_inventory as (
  select coalesce(jsonb_agg(e.extname order by e.extname), '[]'::jsonb) as value
  from pg_catalog.pg_extension e
  where e.extname in ('btree_gist', 'pgcrypto', 'postgis', 'vector')
),
required_objects(object_name) as (
  values
    ('public.cartografia_versiones'),
    ('public.territorios_municipios'),
    ('public.territorios_distritos_locales'),
    ('public.territorios_distritos_federales'),
    ('public.territorios_secciones'),
    ('public.eventos_territoriales'),
    ('public.demografia_eceg_secciones'),
    ('public.lista_nominal_secciones')
),
missing_required_objects as (
  select coalesce(jsonb_agg(object_name order by object_name), '[]'::jsonb) as value
  from required_objects
  where pg_catalog.to_regclass(object_name) is null
),
territorial_inventory as (
  select count(*)::integer as value
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'territorial_private')
    and c.relkind in ('r', 'p', 'v', 'm', 'S')
    and c.relname ~ '^(territorios_|cartografia_|eventos_|demografia_|lista_nominal_|cat_)'
),
rls_violations as (
  select coalesce(jsonb_agg(c.relname order by c.relname), '[]'::jsonb) as value
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and not c.relrowsecurity
),
privilege_violations as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'schema', g.table_schema,
        'table', g.table_name,
        'privilege', g.privilege_type
      ) order by g.table_schema, g.table_name, g.privilege_type
    ),
    '[]'::jsonb
  ) as value
  from information_schema.role_table_grants g
  where g.table_schema in ('public', 'territorial_private')
    and g.grantee = 'PUBLIC'
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
        select 1
        from unnest(coalesce(p.proconfig, array[]::text[])) setting
        where setting like 'search_path=%'
      )
      or pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE')
    )
),
operational_names(object_name) as (
  values
    ('public.municipios'),
    ('public.alcaldes'),
    ('public.datos_electorales'),
    ('public.historial_electoral'),
    ('public.termometros'),
    ('public.escenarios'),
    ('public.comite_municipal'),
    ('public.planilla'),
    ('public.directorio_aspirantes'),
    ('public.usuarios'),
    ('public.roles'),
    ('public.partidos'),
    ('public.configuracion'),
    ('public.estrategia_municipal'),
    ('public.secciones_objetivo'),
    ('public.historial_seccion_electoral'),
    ('public.historial_seccion_resultados'),
    ('public.historial_municipal_oficial'),
    ('public.historial_municipal_oficial_resultados'),
    ('public.historial_seccion_gubernatura'),
    ('public.historial_seccion_gubernatura_resultados')
),
operational_objects as (
  select coalesce(jsonb_agg(object_name order by object_name), '[]'::jsonb) as value
  from operational_names
  where pg_catalog.to_regclass(object_name) is not null
)
select jsonb_build_object(
  'contractVersion', 1,
  'kind', 'promotion_schema_postflight',
  'migrationVersions', migration_history.value,
  'extensions', extension_inventory.value,
  'missingRequiredObjects', missing_required_objects.value,
  'territorialObjectCount', territorial_inventory.value,
  'rlsViolations', rls_violations.value,
  'privilegeViolations', privilege_violations.value,
  'functionViolations', function_violations.value,
  'operationalObjects', operational_objects.value
)
from migration_history,
     extension_inventory,
     missing_required_objects,
     territorial_inventory,
     rls_violations,
     privilege_violations,
     function_violations,
     operational_objects;
