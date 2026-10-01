begin;
alter table public.cartografia_versiones
  add column nombre text not null;
alter table public.cartografia_versiones
  add constraint cartografia_versiones_nombre_ck check (btrim(nombre) <> '');
alter table public.cartografia_versiones
  alter column fecha_corte drop not null;
create or replace function territorial_private.proteger_fuente_version_cartografica()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.estado in ('VALIDADA', 'PUBLICADA', 'ARCHIVADA')
     and (
       new.clave is distinct from old.clave
       or new.nombre is distinct from old.nombre
       or new.proveedor is distinct from old.proveedor
       or new.clave_entidad is distinct from old.clave_entidad
       or new.fecha_corte is distinct from old.fecha_corte
       or new.fecha_publicacion is distinct from old.fecha_publicacion
       or new.fecha_publicacion_esperada is distinct from old.fecha_publicacion_esperada
       or new.vigente_desde is distinct from old.vigente_desde
       or new.vigente_hasta is distinct from old.vigente_hasta
       or new.recibida_at is distinct from old.recibida_at
       or new.srid_origen is distinct from old.srid_origen
       or new.srid_destino is distinct from old.srid_destino
       or new.conteos_esperados is distinct from old.conteos_esperados
       or new.conteos_validados is distinct from old.conteos_validados
       or new.metadata is distinct from old.metadata
     ) then
    raise exception using
      errcode = '55000',
      message = 'campos fuente inmutables despues de VALIDADA';
  end if;
  return new;
end;
$$;
commit;
