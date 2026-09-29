begin;
set transaction read only;

do $preflight$
declare
  v_rpc oid := pg_catalog.to_regprocedure(
    'public.rpc_indicadores_territoriales(text,bigint,bigint,bigint)'
  );
begin
  if v_rpc is null then
    raise exception 'territorial indicators RPC is missing';
  end if;
end
$preflight$;

select pg_catalog.jsonb_build_object(
  'expectedProjectRef', 'nppvprbfmjbhwheghipa',
  'status', case
    when 'enable_nestloop=off' = any(function_config.proconfig)
     and 'work_mem=32MB' = any(function_config.proconfig)
      then 'YA_APLICADA_COMPATIBLE'
    else 'PENDIENTE'
  end,
  'enableNestloop', coalesce(
    (
      select pg_catalog.split_part(setting, '=', 2)
      from pg_catalog.unnest(function_config.proconfig) setting
      where setting like 'enable_nestloop=%'
    ),
    'default'
  ),
  'workMem', coalesce(
    (
      select pg_catalog.split_part(setting, '=', 2)
      from pg_catalog.unnest(function_config.proconfig) setting
      where setting like 'work_mem=%'
    ),
    'default'
  )
) as preflight
from pg_catalog.pg_proc function_config
where function_config.oid = pg_catalog.to_regprocedure(
  'public.rpc_indicadores_territoriales(text,bigint,bigint,bigint)'
);

rollback;
