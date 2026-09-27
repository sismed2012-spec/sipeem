begin;

do $contract$
declare
  v_rpc oid := pg_catalog.to_regprocedure(
    'public.rpc_demografia_revision_bandeja(bigint,text,text,text,integer,integer)'
  );
begin
  if v_rpc is null then
    raise exception 'missing demographic review RPC';
  end if;

  if (select p.prosecdef from pg_catalog.pg_proc p where p.oid = v_rpc) then
    raise exception 'demographic review RPC must be SECURITY INVOKER';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc p
    where p.oid = v_rpc
      and 'search_path=""' = any(p.proconfig)
  ) then
    raise exception 'demographic review RPC must pin an empty search_path';
  end if;

  if pg_catalog.has_function_privilege('public', v_rpc, 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', v_rpc, 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', v_rpc, 'EXECUTE')
  then
    raise exception 'client role can execute demographic review RPC';
  end if;

  if not pg_catalog.has_function_privilege('service_role', v_rpc, 'EXECUTE') then
    raise exception 'service_role cannot execute demographic review RPC';
  end if;
end
$contract$;

do $behavior$
declare
  v_result jsonb;
begin
  v_result := public.rpc_demografia_revision_bandeja(
    4025, null, null, null, 50, 0
  );

  if (v_result #>> '{summary,totalPending}')::integer <> 3
    or (v_result #>> '{summary,multisection}')::integer <> 1
    or (v_result #>> '{summary,manualReview}')::integer <> 1
    or (v_result #>> '{summary,unmatched}')::integer <> 1
  then
    raise exception 'review summary does not preserve pending states';
  end if;

  if pg_catalog.jsonb_array_length(v_result -> 'items') <> 3
    or pg_catalog.jsonb_array_length(v_result -> 'versions') <> 2
  then
    raise exception 'review queue omitted rows or version history';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(v_result -> 'items') item
    where item ->> 'status' = 'DIRECTA'
  ) then
    raise exception 'review queue exposed a direct correspondence';
  end if;

  v_result := public.rpc_demografia_revision_bandeja(
    4025, 'MULTISECCION', '091', 'San Miguel', 1, 0
  );
  if (v_result #>> '{pagination,total}')::integer <> 1
    or pg_catalog.jsonb_array_length(v_result #> '{items,0,candidates}') <> 2
    or (v_result #>> '{items,0,locality,population}')::bigint <> 6404
    or (v_result #>> '{items,0,candidates,0,number}')::integer <> 4488
  then
    raise exception 'review filters or candidate evidence are invalid';
  end if;

  begin
    perform public.rpc_demografia_revision_bandeja(
      4025, 'DIRECTA', null, null, 50, 0
    );
    raise exception 'direct state was accepted by the review RPC';
  exception
    when invalid_parameter_value then null;
  end;
end
$behavior$;

rollback;
