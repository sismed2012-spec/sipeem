create table public.elecciones (
  eleccion_id bigint generated always as identity primary key,
  clave text not null unique,
  nombre text not null,
  fecha_eleccion date not null,
  ambito text not null,
  cargo text not null,
  descripcion text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint elecciones_clave_formato_ck check (clave = upper(clave) and clave ~ '^[A-Z0-9_]+$'),
  constraint elecciones_ambito_ck check (ambito in ('FEDERAL', 'ESTATAL', 'MUNICIPAL')),
  constraint elecciones_cargo_formato_ck check (cargo = upper(cargo) and cargo ~ '^[A-Z0-9_]+$'),
  constraint elecciones_metadata_objeto_ck check (jsonb_typeof(metadata) = 'object')
);

create table public.partidos_catalogo (
  partido_id bigint generated always as identity primary key,
  siglas text not null unique,
  nombre text not null,
  color_hex text,
  activo boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partidos_catalogo_siglas_formato_ck check (siglas = upper(siglas) and siglas ~ '^[A-Z0-9_-]+$'),
  constraint partidos_catalogo_color_hex_ck check (color_hex is null or color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  constraint partidos_catalogo_metadata_objeto_ck check (jsonb_typeof(metadata) = 'object')
);

create table public.resultados_electorales (
  resultado_id bigint generated always as identity primary key,
  eleccion_id bigint not null references public.elecciones(eleccion_id),
  seccion_id bigint not null references public.territorios_secciones(seccion_id),
  partido_id bigint not null references public.partidos_catalogo(partido_id),
  votos integer not null,
  fuente text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resultados_electorales_votos_ck check (votos >= 0),
  constraint resultados_electorales_metadata_objeto_ck check (jsonb_typeof(metadata) = 'object'),
  constraint resultados_electorales_eleccion_seccion_partido_uq unique (eleccion_id, seccion_id, partido_id)
);

create table public.listas_nominales (
  lista_nominal_id bigint generated always as identity primary key,
  eleccion_id bigint not null references public.elecciones(eleccion_id),
  seccion_id bigint not null references public.territorios_secciones(seccion_id),
  total integer not null,
  hombres integer,
  mujeres integer,
  no_especificado integer,
  fuente text,
  fecha_corte date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listas_nominales_total_ck check (total >= 0),
  constraint listas_nominales_desglose_no_negativo_ck check (
    coalesce(hombres, 0) >= 0 and coalesce(mujeres, 0) >= 0 and coalesce(no_especificado, 0) >= 0
  ),
  constraint listas_nominales_desglose_total_ck check (
    coalesce(hombres, 0) + coalesce(mujeres, 0) + coalesce(no_especificado, 0) <= total
  ),
  constraint listas_nominales_metadata_objeto_ck check (jsonb_typeof(metadata) = 'object'),
  constraint listas_nominales_eleccion_seccion_uq unique (eleccion_id, seccion_id)
);

create table public.participacion_electoral (
  participacion_id bigint generated always as identity primary key,
  eleccion_id bigint not null,
  seccion_id bigint not null,
  votos_emitidos integer not null,
  votos_validos integer not null,
  votos_nulos integer not null default 0,
  votos_no_registrados integer not null default 0,
  fuente text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint participacion_electoral_conteos_no_negativos_ck check (
    votos_emitidos >= 0 and votos_validos >= 0 and votos_nulos >= 0 and votos_no_registrados >= 0
  ),
  constraint participacion_electoral_desglose_ck check (
    votos_validos + votos_nulos + votos_no_registrados = votos_emitidos
  ),
  constraint participacion_electoral_metadata_objeto_ck check (jsonb_typeof(metadata) = 'object'),
  constraint participacion_electoral_eleccion_seccion_uq unique (eleccion_id, seccion_id),
  constraint participacion_electoral_lista_nominal_fk
    foreign key (eleccion_id, seccion_id)
    references public.listas_nominales(eleccion_id, seccion_id)
);

create function territorial_private.validar_lista_nominal_integridad()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_votos_emitidos integer;
  v_lock_nuevo bigint;
  v_lock_anterior bigint;
begin
  v_lock_nuevo := pg_catalog.hashtextextended(new.eleccion_id::text || ':' || new.seccion_id::text, 0);
  if tg_op = 'UPDATE' then
    v_lock_anterior := pg_catalog.hashtextextended(old.eleccion_id::text || ':' || old.seccion_id::text, 0);
    perform pg_catalog.pg_advisory_xact_lock(least(v_lock_nuevo, v_lock_anterior));
    if v_lock_nuevo <> v_lock_anterior then
      perform pg_catalog.pg_advisory_xact_lock(greatest(v_lock_nuevo, v_lock_anterior));
    end if;
  else
    perform pg_catalog.pg_advisory_xact_lock(v_lock_nuevo);
  end if;

  select pe.votos_emitidos
  into v_votos_emitidos
  from public.participacion_electoral pe
  where pe.eleccion_id = new.eleccion_id and pe.seccion_id = new.seccion_id;

  if v_votos_emitidos is not null and v_votos_emitidos > new.total then
    raise exception 'La lista nominal (%) no puede ser menor a los votos emitidos (%)', new.total, v_votos_emitidos
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create function territorial_private.validar_participacion_integridad()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lista_nominal integer;
  v_resultados_total bigint;
  v_lock_nuevo bigint;
  v_lock_anterior bigint;
begin
  v_lock_nuevo := pg_catalog.hashtextextended(new.eleccion_id::text || ':' || new.seccion_id::text, 0);
  if tg_op = 'UPDATE' then
    v_lock_anterior := pg_catalog.hashtextextended(old.eleccion_id::text || ':' || old.seccion_id::text, 0);
    perform pg_catalog.pg_advisory_xact_lock(least(v_lock_nuevo, v_lock_anterior));
    if v_lock_nuevo <> v_lock_anterior then
      perform pg_catalog.pg_advisory_xact_lock(greatest(v_lock_nuevo, v_lock_anterior));
    end if;
  else
    perform pg_catalog.pg_advisory_xact_lock(v_lock_nuevo);
  end if;

  select ln.total
  into v_lista_nominal
  from public.listas_nominales ln
  where ln.eleccion_id = new.eleccion_id and ln.seccion_id = new.seccion_id
  for share;

  if v_lista_nominal is not null and new.votos_emitidos > v_lista_nominal then
    raise exception 'Los votos emitidos (%) superan la lista nominal (%)', new.votos_emitidos, v_lista_nominal
      using errcode = '23514';
  end if;

  select coalesce(sum(re.votos), 0)
  into v_resultados_total
  from public.resultados_electorales re
  where re.eleccion_id = new.eleccion_id and re.seccion_id = new.seccion_id;

  if v_resultados_total > new.votos_validos then
    raise exception 'Los resultados por partido (%) superan los votos válidos (%)', v_resultados_total, new.votos_validos
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create function territorial_private.validar_resultado_electoral_integridad()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_votos_validos integer;
  v_resultados_total bigint;
  v_lock_nuevo bigint;
  v_lock_anterior bigint;
begin
  v_lock_nuevo := pg_catalog.hashtextextended(new.eleccion_id::text || ':' || new.seccion_id::text, 0);
  if tg_op = 'UPDATE' then
    v_lock_anterior := pg_catalog.hashtextextended(old.eleccion_id::text || ':' || old.seccion_id::text, 0);
    perform pg_catalog.pg_advisory_xact_lock(least(v_lock_nuevo, v_lock_anterior));
    if v_lock_nuevo <> v_lock_anterior then
      perform pg_catalog.pg_advisory_xact_lock(greatest(v_lock_nuevo, v_lock_anterior));
    end if;
  else
    perform pg_catalog.pg_advisory_xact_lock(v_lock_nuevo);
  end if;

  select pe.votos_validos
  into v_votos_validos
  from public.participacion_electoral pe
  where pe.eleccion_id = new.eleccion_id and pe.seccion_id = new.seccion_id
  for update;

  if v_votos_validos is null then
    return new;
  end if;

  select coalesce(sum(re.votos), 0)
  into v_resultados_total
  from public.resultados_electorales re
  where re.eleccion_id = new.eleccion_id
    and re.seccion_id = new.seccion_id
    and (tg_op <> 'UPDATE' or re.resultado_id <> old.resultado_id);

  if v_resultados_total + new.votos > v_votos_validos then
    raise exception 'Los resultados por partido (%) superan los votos válidos (%)',
      v_resultados_total + new.votos, v_votos_validos
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function territorial_private.validar_lista_nominal_integridad()
  from public, anon, authenticated;
revoke all on function territorial_private.validar_participacion_integridad()
  from public, anon, authenticated;
revoke all on function territorial_private.validar_resultado_electoral_integridad()
  from public, anon, authenticated;

create trigger listas_nominales_validar_integridad
  before insert or update on public.listas_nominales
  for each row execute function territorial_private.validar_lista_nominal_integridad();
create trigger participacion_electoral_validar_integridad
  before insert or update on public.participacion_electoral
  for each row execute function territorial_private.validar_participacion_integridad();
create trigger resultados_electorales_validar_integridad
  before insert or update on public.resultados_electorales
  for each row execute function territorial_private.validar_resultado_electoral_integridad();

create trigger partidos_catalogo_set_updated_at
  before update on public.partidos_catalogo
  for each row execute function territorial_private.set_updated_at();
create trigger resultados_electorales_set_updated_at
  before update on public.resultados_electorales
  for each row execute function territorial_private.set_updated_at();
create trigger listas_nominales_set_updated_at
  before update on public.listas_nominales
  for each row execute function territorial_private.set_updated_at();
create trigger participacion_electoral_set_updated_at
  before update on public.participacion_electoral
  for each row execute function territorial_private.set_updated_at();

create index elecciones_fecha_idx on public.elecciones (fecha_eleccion desc);
create index resultados_electorales_seccion_idx on public.resultados_electorales (seccion_id, eleccion_id);
create index resultados_electorales_partido_idx on public.resultados_electorales (partido_id, eleccion_id);
create index listas_nominales_seccion_idx on public.listas_nominales (seccion_id, eleccion_id);
create index participacion_electoral_seccion_idx on public.participacion_electoral (seccion_id, eleccion_id);

alter table public.elecciones enable row level security;
alter table public.partidos_catalogo enable row level security;
alter table public.resultados_electorales enable row level security;
alter table public.listas_nominales enable row level security;
alter table public.participacion_electoral enable row level security;

revoke all on table
  public.elecciones,
  public.partidos_catalogo,
  public.resultados_electorales,
  public.listas_nominales,
  public.participacion_electoral
from anon, authenticated;

grant select, insert, update, delete on table
  public.elecciones,
  public.partidos_catalogo,
  public.resultados_electorales,
  public.listas_nominales,
  public.participacion_electoral
to service_role;

revoke all on sequence
  public.elecciones_eleccion_id_seq,
  public.partidos_catalogo_partido_id_seq,
  public.resultados_electorales_resultado_id_seq,
  public.listas_nominales_lista_nominal_id_seq,
  public.participacion_electoral_participacion_id_seq
from anon, authenticated;

grant usage, select on sequence
  public.elecciones_eleccion_id_seq,
  public.partidos_catalogo_partido_id_seq,
  public.resultados_electorales_resultado_id_seq,
  public.listas_nominales_lista_nominal_id_seq,
  public.participacion_electoral_participacion_id_seq
to service_role;

;
