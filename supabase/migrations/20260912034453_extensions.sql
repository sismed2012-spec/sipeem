-- Extensiones compartidas del núcleo Inteligencia Territorial IA + SIG.
create schema if not exists extensions;

do $$
declare
  v_extension record;
begin
  for v_extension in
    select e.extname, n.nspname
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname in ('pgcrypto', 'vector', 'postgis')
  loop
    if v_extension.nspname <> 'extensions' then
      raise exception 'La extensión % ya está instalada en el esquema %, se requiere extensions',
        v_extension.extname, v_extension.nspname
        using errcode = '55000';
    end if;
  end loop;
end;
$$;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema extensions;
create extension if not exists postgis with schema extensions;

create schema if not exists territorial_private;
revoke all on schema territorial_private from public, anon, authenticated;

create function territorial_private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

revoke all on function territorial_private.set_updated_at()
  from public, anon, authenticated;

;
