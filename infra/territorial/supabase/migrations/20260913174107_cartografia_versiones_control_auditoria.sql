begin;
create function territorial_private.auditar_control_cartografico()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_evento text;
  v_estado_anterior text;
  v_detalle jsonb;
begin
  if tg_table_schema = 'public' and tg_table_name = 'cartografia_versiones' then
    if tg_op = 'INSERT' then
      v_evento := 'VERSION_CREADA';
      v_estado_anterior := null;
    elsif tg_op = 'UPDATE' and old.estado is distinct from new.estado then
      v_evento := 'VERSION_TRANSICION';
      v_estado_anterior := old.estado;
    else
      return new;
    end if;

    v_detalle := pg_catalog.jsonb_build_object(
      'clave', new.clave,
      'clave_entidad', new.clave_entidad,
      'es_predeterminada', new.es_predeterminada,
      'publicada_at', new.publicada_at,
      'archivada_at', new.archivada_at,
      'restauracion_validada_at', new.restauracion_validada_at
    );

    insert into public.cartografia_versiones_bitacora (
      cartografia_version_id,
      carga_id,
      evento,
      estado_anterior,
      estado_nuevo,
      detalle,
      actor_id
    ) values (
      new.cartografia_version_id,
      null,
      v_evento,
      v_estado_anterior,
      new.estado,
      v_detalle,
      (select auth.uid())
    );

    return new;
  end if;

  if tg_table_schema = 'public' and tg_table_name = 'cargas_cartograficas' then
    if tg_op = 'INSERT' then
      v_evento := 'CARGA_CREADA';
      v_estado_anterior := null;
    elsif tg_op = 'UPDATE' and old.estado is distinct from new.estado then
      v_evento := 'CARGA_TRANSICION';
      v_estado_anterior := old.estado;
    elsif tg_op = 'UPDATE' then
      v_evento := 'CARGA_INTENTO';
      v_estado_anterior := old.estado;
    else
      return new;
    end if;

    v_detalle := pg_catalog.jsonb_build_object(
      'capa_actual', new.capa_actual,
      'cursor_confirmado', new.cursor_confirmado,
      'recibidos', new.recibidos,
      'insertados', new.insertados,
      'repetidos', new.repetidos,
      'rechazados', new.rechazados,
      'codigo_fallo', new.codigo_fallo,
      'reanudable', new.reanudable,
      'mgs_sha256', new.mgs_sha256,
      'bgd_sha256', new.bgd_sha256,
      'manifiesto_sha256', new.manifiesto_sha256
    );

    insert into public.cartografia_versiones_bitacora (
      cartografia_version_id,
      carga_id,
      evento,
      estado_anterior,
      estado_nuevo,
      detalle,
      actor_id
    ) values (
      new.cartografia_version_id,
      new.carga_id,
      v_evento,
      v_estado_anterior,
      new.estado,
      v_detalle,
      (select auth.uid())
    );

    return new;
  end if;

  raise exception using
    errcode = '55000',
    message = pg_catalog.format(
      'auditoria cartografica no soportada para %I.%I %s',
      tg_table_schema,
      tg_table_name,
      tg_op
    );
end;
$$;
revoke execute on function territorial_private.auditar_control_cartografico()
from public, anon, authenticated;
create trigger cartografia_versiones_auditar
after insert or update on public.cartografia_versiones
for each row execute function territorial_private.auditar_control_cartografico();
create trigger cargas_cartograficas_auditar
after insert or update on public.cargas_cartograficas
for each row execute function territorial_private.auditar_control_cartografico();
comment on function territorial_private.auditar_control_cartografico() is
  'Registra de forma atomica la creacion y transiciones de versiones y los intentos de la carga canonica.';
commit;
