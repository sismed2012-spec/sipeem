create or replace function public.trg_demografia_eceg_child_mutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_source_state text;
  v_source_dataset text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select estado, conjunto
      into strict v_source_state, v_source_dataset
    from public.demografia_fuentes
    where demografia_fuente_id = old.demografia_fuente_id;

    if v_source_dataset = 'CPV2020_ECEG'
        and v_source_state not in ('PREPARADA', 'CARGANDO') then
      raise exception using
        errcode = '55000',
        message = pg_catalog.format(
          'ECEG source %s is immutable in state %s',
          old.demografia_fuente_id,
          v_source_state
        );
    end if;
  end if;

  if tg_op = 'INSERT'
      or (
        tg_op = 'UPDATE'
        and new.demografia_fuente_id is distinct from old.demografia_fuente_id
      ) then
    select estado, conjunto
      into strict v_source_state, v_source_dataset
    from public.demografia_fuentes
    where demografia_fuente_id = new.demografia_fuente_id;

    if v_source_dataset = 'CPV2020_ECEG'
        and v_source_state not in ('PREPARADA', 'CARGANDO') then
      raise exception using
        errcode = '55000',
        message = pg_catalog.format(
          'ECEG source %s is immutable in state %s',
          new.demografia_fuente_id,
          v_source_state
        );
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$function$;

revoke all on function public.trg_demografia_eceg_child_mutable()
  from public, anon, authenticated, service_role;
