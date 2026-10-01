alter function public.rpc_validar_carga_electoral_lote(uuid, integer)
  rename to rpc_validar_carga_electoral_lote_core;

alter function public.rpc_validar_carga_electoral_lote_core(uuid, integer)
  set schema territorial_private;

revoke all on function territorial_private.rpc_validar_carga_electoral_lote_core(uuid, integer)
  from public, anon, authenticated;
grant execute on function territorial_private.rpc_validar_carga_electoral_lote_core(uuid, integer)
  to service_role;

create function public.rpc_validar_carga_electoral_lote(
  p_carga_id uuid,
  p_lote integer default 500
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_respuesta jsonb;
begin
  v_respuesta := territorial_private.rpc_validar_carga_electoral_lote_core(
    p_carga_id,
    p_lote
  );

  if coalesce((v_respuesta ->> 'completa')::boolean, false) then
    update public.cargas_electorales carga
    set estado = 'VALIDADA',
        registros_recibidos = coalesce(
          (v_respuesta ->> 'registros')::bigint,
          carga.registros_recibidos
        ),
        resultados_recibidos = coalesce(
          (v_respuesta ->> 'resultados')::bigint,
          carga.resultados_recibidos
        ),
        registros_validos = coalesce(
          (v_respuesta ->> 'validos')::bigint,
          carga.registros_validos
        ),
        registros_observados = coalesce(
          (v_respuesta ->> 'observados')::bigint,
          carga.registros_observados
        ),
        registros_cuarentena = coalesce(
          (v_respuesta ->> 'cuarentena')::bigint,
          carga.registros_cuarentena
        ),
        iniciada_at = coalesce(carga.iniciada_at, carga.created_at),
        finalizada_at = coalesce(carga.finalizada_at, statement_timestamp()),
        detalle_error = null
    where carga.carga_id = p_carga_id;
  end if;

  return v_respuesta;
end;
$$;

revoke all on function public.rpc_validar_carga_electoral_lote(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.rpc_validar_carga_electoral_lote(uuid, integer)
  to service_role;

comment on function territorial_private.rpc_validar_carga_electoral_lote_core(uuid, integer) is
  'Implementación interna de la validación electoral reanudable por lotes.';

comment on function public.rpc_validar_carga_electoral_lote(uuid, integer) is
  'Valida una carga por lotes y reconcilia a VALIDADA una ejecución completa e idempotente.';;
