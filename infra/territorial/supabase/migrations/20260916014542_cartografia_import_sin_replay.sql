begin;
set local lock_timeout = '10s';

-- M22: un solo operador puede atribuirse la primera confirmacion de un
-- rango. El RPC base conserva intacto su contrato de replay idempotente.
create function public.rpc_importar_lote_cartografico_sin_replay(
  p_carga_id bigint,
  p_capa text,
  p_registro_desde bigint,
  p_registro_hasta bigint,
  p_features jsonb
) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_version_id bigint;
  v_resultado jsonb;
begin
  if p_carga_id is null or p_capa is null
     or p_registro_desde is null or p_registro_hasta is null
     or p_features is null then
    raise exception using
      errcode = '22004',
      message = 'los parametros del lote cartografico no pueden ser nulos';
  end if;

  select c.cartografia_version_id into v_version_id
  from public.cargas_cartograficas c
  where c.carga_id = p_carga_id;
  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'carga cartografica inexistente';
  end if;

  -- Mismo lock de VERSION usado por rpc_importar_lote_cartografico.
  -- Try-lock evita esperar a otro operador y no agrega una segunda
  -- transaccion entre comprobar el ledger e importar el lote.
  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'SIPEEM:CARTOGRAFIA:VERSION:' || v_version_id::text, 0
    )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'AUDITORIA_REQUERIDA: version cartografica en carga concurrente';
  end if;

  if exists (
    select 1 from public.cargas_cartograficas_lotes l
    where l.carga_id = p_carga_id
      and l.capa = p_capa
      and l.registro_desde = p_registro_desde
      and l.registro_hasta = p_registro_hasta
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'AUDITORIA_REQUERIDA: rango cartografico ya confirmado';
  end if;

  select public.rpc_importar_lote_cartografico(
    p_carga_id, p_capa, p_registro_desde, p_registro_hasta, p_features
  ) into v_resultado;
  return v_resultado;
end;
$function$;

revoke all on function public.rpc_importar_lote_cartografico_sin_replay(
  bigint, text, bigint, bigint, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.rpc_importar_lote_cartografico_sin_replay(
  bigint, text, bigint, bigint, jsonb
) to service_role;

comment on function public.rpc_importar_lote_cartografico_sin_replay(
  bigint, text, bigint, bigint, jsonb
) is 'IMPORT transaccional sin atribuir un replay como confirmacion propia; solo service_role';

commit;

;
