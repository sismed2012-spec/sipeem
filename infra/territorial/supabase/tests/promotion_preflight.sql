with
identity_report as (
  select jsonb_build_object(
    'database', current_database(),
    'postgresVersion', current_setting('server_version'),
    'postgresVersionNumber', current_setting('server_version_num')::integer,
    'region', coalesce(
      current_setting('cloud_provider.region', true),
      current_setting('app.settings.region', true),
      'unavailable'
    )
  ) as value
),
extension_report as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object('name', e.extname, 'version', e.extversion)
      order by e.extname
    ),
    '[]'::jsonb
  ) as value
  from pg_catalog.pg_extension e
),
user_table_report as (
  select coalesce(jsonb_agg(c.relname order by c.relname), '[]'::jsonb) as value
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
),
migration_history_report as (
  select jsonb_build_object(
    'exists', pg_catalog.to_regclass('supabase_migrations.schema_migrations') is not null,
    'rows', case
      when pg_catalog.to_regclass('supabase_migrations.schema_migrations') is null then 0
      else ((xpath(
        '//count/text()',
        pg_catalog.query_to_xml(
          'select count(*) as count from supabase_migrations.schema_migrations',
          false,
          false,
          ''
        )
      ))[1]::text)::bigint
    end
  ) as value
),
territorial_counts as (
  select jsonb_build_object(
    'cartographyVersions', case when pg_catalog.to_regclass('public.cartografia_versiones') is null then 0 else ((xpath('//count/text()', pg_catalog.query_to_xml('select count(*) as count from public.cartografia_versiones', false, false, '')))[1]::text)::bigint end,
    'sections', case when pg_catalog.to_regclass('public.territorios_secciones') is null then 0 else ((xpath('//count/text()', pg_catalog.query_to_xml('select count(*) as count from public.territorios_secciones', false, false, '')))[1]::text)::bigint end,
    'municipalities', case when pg_catalog.to_regclass('public.territorios_municipios') is null then 0 else ((xpath('//count/text()', pg_catalog.query_to_xml('select count(*) as count from public.territorios_municipios', false, false, '')))[1]::text)::bigint end,
    'localDistricts', case when pg_catalog.to_regclass('public.territorios_distritos_locales') is null then 0 else ((xpath('//count/text()', pg_catalog.query_to_xml('select count(*) as count from public.territorios_distritos_locales', false, false, '')))[1]::text)::bigint end,
    'federalDistricts', case when pg_catalog.to_regclass('public.territorios_distritos_federales') is null then 0 else ((xpath('//count/text()', pg_catalog.query_to_xml('select count(*) as count from public.territorios_distritos_federales', false, false, '')))[1]::text)::bigint end,
    'ecegSections', case when pg_catalog.to_regclass('public.demografia_eceg_secciones') is null then 0 else ((xpath('//count/text()', pg_catalog.query_to_xml('select count(*) as count from public.demografia_eceg_secciones', false, false, '')))[1]::text)::bigint end,
    'nominalRows', case when pg_catalog.to_regclass('public.lista_nominal_secciones') is null then 0 else ((xpath('//count/text()', pg_catalog.query_to_xml('select count(*) as count from public.lista_nominal_secciones', false, false, '')))[1]::text)::bigint end
  ) as value
)
select jsonb_build_object(
  'contractVersion', 1,
  'kind', 'promotion_preflight',
  'projectRef', coalesce(
    current_setting('supabase.project_ref', true),
    current_setting('app.settings.project_ref', true)
  ),
  'identity', identity_report.value,
  'extensions', extension_report.value,
  'databaseSizeBytes', pg_catalog.pg_database_size(current_database()),
  'userTables', user_table_report.value,
  'migrationHistory', migration_history_report.value,
  'counts', territorial_counts.value
)
from identity_report, extension_report, user_table_report, migration_history_report, territorial_counts;
