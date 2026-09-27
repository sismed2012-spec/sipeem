select jsonb_build_object(
  'rpc_present', true,
  'security_invoker', p.prosecdef is false,
  'search_path_config', p.proconfig,
  'fixed_search_path', p.proconfig is not null
    and exists (
      select 1
      from unnest(p.proconfig) setting
      where setting like 'search_path=%'
    ),
  'public_execute', has_function_privilege('public', p.oid, 'EXECUTE'),
  'authenticated_execute', has_function_privilege(
    'authenticated', p.oid, 'EXECUTE'
  ),
  'service_role_execute', has_function_privilege(
    'service_role', p.oid, 'EXECUTE'
  ),
  'sample_summary', sample.payload -> 'summary',
  'sample_pagination', sample.payload -> 'pagination',
  'sample_version', sample.payload -> 'selectedVersion'
) as postflight
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral (
  select public.rpc_demografia_revision_bandeja(
    4025, null, null, null, 1, 0
  ) as payload
) sample
where n.nspname = 'public'
  and p.proname = 'rpc_demografia_revision_bandeja'
  and pg_get_function_identity_arguments(p.oid) =
    'p_cartografia_version_id bigint, p_estado text, p_clave_municipio text, p_busqueda text, p_limite integer, p_offset integer';
