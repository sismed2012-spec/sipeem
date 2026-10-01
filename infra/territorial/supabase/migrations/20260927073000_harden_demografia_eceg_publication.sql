alter table public.demografia_eceg_secciones
  drop constraint demografia_eceg_secciones_marco_ck;

alter table public.demografia_eceg_secciones
  add constraint demografia_eceg_secciones_marco_ck check (
    marco_cartografico_fecha = date '2021-01-31'
  );

alter table public.demografia_fuentes
  add constraint demografia_fuentes_eceg_marco_ck check (
    conjunto <> 'CPV2020_ECEG'
    or metadatos ->> 'sourceFrameDate' = '2021-01-31'
  );

create or replace function public.trg_demografia_eceg_child_mutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_source_id bigint;
  v_source_state text;
  v_source_dataset text;
begin
  if tg_op = 'DELETE' then
    v_source_id := old.demografia_fuente_id;
  else
    v_source_id := new.demografia_fuente_id;
  end if;

  select estado, conjunto
    into strict v_source_state, v_source_dataset
  from public.demografia_fuentes
  where demografia_fuente_id = v_source_id;

  if v_source_dataset = 'CPV2020_ECEG'
      and v_source_state not in ('PREPARADA', 'CARGANDO') then
    raise exception using
      errcode = '55000',
      message = pg_catalog.format(
        'ECEG source %s is immutable in state %s',
        v_source_id,
        v_source_state
      );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$function$;

create or replace function public.trg_demografia_eceg_source_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.conjunto = 'CPV2020_ECEG'
      and old.estado not in ('PREPARADA', 'CARGANDO') then
    raise exception using
      errcode = '55000',
      message = pg_catalog.format(
        'ECEG source %s is immutable in state %s',
        old.demografia_fuente_id,
        old.estado
      );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$function$;

create trigger demografia_eceg_secciones_mutable_trg
before insert or update or delete on public.demografia_eceg_secciones
for each row execute function public.trg_demografia_eceg_child_mutable();

create trigger demografia_eceg_correspondencias_mutable_trg
before insert or update or delete on public.demografia_eceg_correspondencias
for each row execute function public.trg_demografia_eceg_child_mutable();

create trigger demografia_eceg_indicadores_mutable_trg
before insert or update or delete on public.demografia_indicadores
for each row execute function public.trg_demografia_eceg_child_mutable();

create trigger demografia_eceg_fuente_immutable_trg
before update or delete on public.demografia_fuentes
for each row execute function public.trg_demografia_eceg_source_immutable();

revoke all on function public.trg_demografia_eceg_child_mutable()
  from public, anon, authenticated, service_role;
revoke all on function public.trg_demografia_eceg_source_immutable()
  from public, anon, authenticated, service_role;
