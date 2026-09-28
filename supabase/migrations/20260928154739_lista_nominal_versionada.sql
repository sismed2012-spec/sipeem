begin;

create table public.lista_nominal_cortes (
  lista_nominal_corte_id bigint generated always as identity primary key,
  clave text not null,
  fecha_corte date not null,
  clave_entidad text not null,
  fuente text not null,
  archivo_nombre text not null,
  archivo_sha256 text not null,
  estado text not null default 'RECIBIDO',
  filas_secciones integer not null,
  padron_total bigint not null,
  lista_nominal_total bigint not null,
  diferencia_total bigint not null,
  residentes_extranjero jsonb not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  validado_at timestamptz,
  publicado_at timestamptz,
  archivado_at timestamptz,
  constraint lista_nominal_cortes_clave_uk unique (clave),
  constraint lista_nominal_cortes_archivo_sha256_uk unique (archivo_sha256),
  constraint lista_nominal_cortes_clave_ck check (pg_catalog.btrim(clave) <> ''),
  constraint lista_nominal_cortes_entidad_ck check (clave_entidad ~ '^[0-9]{2}$'),
  constraint lista_nominal_cortes_fuente_ck check (
    pg_catalog.btrim(fuente) <> '' and fuente = pg_catalog.upper(fuente)
  ),
  constraint lista_nominal_cortes_archivo_ck check (pg_catalog.btrim(archivo_nombre) <> ''),
  constraint lista_nominal_cortes_sha_ck check (archivo_sha256 ~ '^[0-9a-f]{64}$'),
  constraint lista_nominal_cortes_estado_ck check (
    estado in ('RECIBIDO', 'VALIDADO', 'PUBLICADO', 'ARCHIVADO')
  ),
  constraint lista_nominal_cortes_conteos_ck check (
    filas_secciones > 0
    and padron_total >= 0
    and lista_nominal_total >= 0
    and diferencia_total >= 0
    and diferencia_total = padron_total - lista_nominal_total
  ),
  constraint lista_nominal_cortes_extranjero_ck check (
    pg_catalog.jsonb_typeof(residentes_extranjero) = 'object'
  ),
  constraint lista_nominal_cortes_metadata_ck check (
    pg_catalog.jsonb_typeof(metadata) = 'object'
  ),
  constraint lista_nominal_cortes_estado_fechas_ck check (
    (
      estado = 'RECIBIDO'
      and validado_at is null
      and publicado_at is null
      and archivado_at is null
    )
    or (
      estado = 'VALIDADO'
      and validado_at is not null
      and publicado_at is null
      and archivado_at is null
    )
    or (
      estado = 'PUBLICADO'
      and validado_at is not null
      and publicado_at is not null
      and publicado_at >= validado_at
      and archivado_at is null
    )
    or (
      estado = 'ARCHIVADO'
      and validado_at is not null
      and publicado_at is not null
      and archivado_at is not null
      and publicado_at >= validado_at
      and archivado_at >= publicado_at
    )
  )
);

create unique index lista_nominal_cortes_publicado_fecha_entidad_uk
  on public.lista_nominal_cortes (clave_entidad, fecha_corte)
  where estado = 'PUBLICADO';

create table public.lista_nominal_secciones (
  lista_nominal_seccion_id bigint generated always as identity primary key,
  lista_nominal_corte_id bigint not null
    references public.lista_nominal_cortes(lista_nominal_corte_id) on delete cascade,
  clave_entidad text not null,
  clave_municipio text not null,
  municipio_nombre text not null,
  distrito_local integer not null,
  distrito_local_nombre text,
  distrito_federal integer not null,
  distrito_federal_nombre text,
  numero_seccion integer not null,
  padron_hombres integer not null,
  padron_mujeres integer not null,
  padron_no_binario integer not null,
  padron_total integer not null,
  lista_hombres integer not null,
  lista_mujeres integer not null,
  lista_no_binario integer not null,
  lista_total integer not null,
  diferencia integer not null,
  cobertura double precision not null,
  fila_origen integer not null,
  payload_auditoria jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint lista_nominal_secciones_corte_entidad_numero_uk unique (
    lista_nominal_corte_id, clave_entidad, numero_seccion
  ),
  constraint lista_nominal_secciones_id_corte_uk unique (
    lista_nominal_seccion_id, lista_nominal_corte_id
  ),
  constraint lista_nominal_secciones_entidad_ck check (clave_entidad ~ '^[0-9]{2}$'),
  constraint lista_nominal_secciones_municipio_ck check (clave_municipio ~ '^[0-9]{3}$'),
  constraint lista_nominal_secciones_municipio_nombre_ck check (
    pg_catalog.btrim(municipio_nombre) <> ''
  ),
  constraint lista_nominal_secciones_distritos_ck check (
    distrito_local > 0 and distrito_federal > 0
  ),
  constraint lista_nominal_secciones_nombres_distrito_ck check (
    (distrito_local_nombre is null or pg_catalog.btrim(distrito_local_nombre) <> '')
    and (distrito_federal_nombre is null or pg_catalog.btrim(distrito_federal_nombre) <> '')
  ),
  constraint lista_nominal_secciones_numero_ck check (numero_seccion > 0),
  constraint lista_nominal_secciones_conteos_ck check (
    padron_hombres >= 0
    and padron_mujeres >= 0
    and padron_no_binario >= 0
    and padron_total >= 0
    and lista_hombres >= 0
    and lista_mujeres >= 0
    and lista_no_binario >= 0
    and lista_total >= 0
    and diferencia >= 0
  ),
  constraint lista_nominal_secciones_padron_sexos_ck check (
    padron_total = padron_hombres + padron_mujeres + padron_no_binario
  ),
  constraint lista_nominal_secciones_lista_sexos_ck check (
    lista_total = lista_hombres + lista_mujeres + lista_no_binario
  ),
  constraint lista_nominal_secciones_diferencia_ck check (
    diferencia = padron_total - lista_total
  ),
  constraint lista_nominal_secciones_cobertura_ck check (
    cobertura not in (
      'NaN'::double precision,
      'Infinity'::double precision,
      '-Infinity'::double precision
    )
    and cobertura between 0 and 100
    and (
      (padron_total = 0 and cobertura = 0)
      or (
        padron_total > 0
        and pg_catalog.abs(
          cobertura - (lista_total::double precision * 100.0 / padron_total)
        ) <= 0.0000001
      )
    )
  ),
  constraint lista_nominal_secciones_fila_ck check (fila_origen >= 14),
  constraint lista_nominal_secciones_payload_ck check (
    pg_catalog.jsonb_typeof(payload_auditoria) = 'object'
  )
);

create index lista_nominal_secciones_corte_municipio_idx
  on public.lista_nominal_secciones (
    lista_nominal_corte_id, clave_entidad, clave_municipio, numero_seccion
  );

create table public.lista_nominal_correspondencias (
  lista_nominal_correspondencia_id bigint generated always as identity primary key,
  lista_nominal_corte_id bigint not null,
  lista_nominal_seccion_id bigint not null,
  cartografia_version_id bigint not null
    references public.cartografia_versiones(cartografia_version_id) on delete restrict,
  cartografia_seccion_id bigint,
  seccion_id bigint,
  municipio_id bigint references public.territorios_municipios(municipio_id) on delete restrict,
  estado text not null default 'PENDIENTE',
  motivo text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint lista_nominal_correspondencias_nominal_fk
    foreign key (lista_nominal_seccion_id, lista_nominal_corte_id)
    references public.lista_nominal_secciones (
      lista_nominal_seccion_id, lista_nominal_corte_id
    ) on delete cascade,
  constraint lista_nominal_correspondencias_cartografia_fk
    foreign key (cartografia_seccion_id, cartografia_version_id, seccion_id)
    references public.cartografia_secciones (
      cartografia_seccion_id, cartografia_version_id, seccion_id
    ) on delete restrict,
  constraint lista_nominal_correspondencias_evaluacion_uk unique (
    lista_nominal_seccion_id, cartografia_version_id
  ),
  constraint lista_nominal_correspondencias_estado_ck check (
    estado in ('VINCULADA', 'PENDIENTE', 'AMBIGUA', 'EXCLUIDA')
  ),
  constraint lista_nominal_correspondencias_motivo_ck check (
    motivo is null or pg_catalog.btrim(motivo) <> ''
  ),
  constraint lista_nominal_correspondencias_metadata_ck check (
    pg_catalog.jsonb_typeof(metadata) = 'object'
  ),
  constraint lista_nominal_correspondencias_destino_ck check (
    (
      estado = 'VINCULADA'
      and cartografia_seccion_id is not null
      and seccion_id is not null
      and municipio_id is not null
    )
    or (
      estado <> 'VINCULADA'
      and cartografia_seccion_id is null
      and seccion_id is null
      and municipio_id is null
    )
  )
);

create index lista_nominal_correspondencias_version_estado_idx
  on public.lista_nominal_correspondencias (cartografia_version_id, estado);

create index lista_nominal_correspondencias_corte_destino_idx
  on public.lista_nominal_correspondencias (
    lista_nominal_corte_id, cartografia_version_id, cartografia_seccion_id
  ) where estado = 'VINCULADA';

create function territorial_private.lista_nominal_guardar_estado_corte()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old_business jsonb;
  v_new_business jsonb;
begin
  if tg_op = 'DELETE' then
    if old.estado in ('PUBLICADO', 'ARCHIVADO') then
      raise exception using
        errcode = '55000',
        message = 'Un corte nominal publicado o archivado es inmutable';
    end if;
    return old;
  end if;

  if new.estado is distinct from old.estado and not (
    (old.estado = 'RECIBIDO' and new.estado = 'VALIDADO')
    or (old.estado = 'VALIDADO' and new.estado = 'PUBLICADO')
    or (old.estado = 'PUBLICADO' and new.estado = 'ARCHIVADO')
  ) then
    raise exception using
      errcode = '23514',
      message = pg_catalog.format(
        'Transición de corte nominal inválida: %s -> %s',
        old.estado,
        new.estado
      );
  end if;

  if old.estado in ('PUBLICADO', 'ARCHIVADO') then
    v_old_business := pg_catalog.to_jsonb(old)
      - 'estado' - 'updated_at' - 'archivado_at';
    v_new_business := pg_catalog.to_jsonb(new)
      - 'estado' - 'updated_at' - 'archivado_at';
    if v_new_business is distinct from v_old_business then
      raise exception using
        errcode = '55000',
        message = 'Un corte nominal publicado o archivado es inmutable';
    end if;
  end if;

  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create function territorial_private.lista_nominal_guardar_filas_publicadas()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_estado text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select c.estado
    into v_estado
    from public.lista_nominal_cortes c
    where c.lista_nominal_corte_id = old.lista_nominal_corte_id;
    if v_estado in ('PUBLICADO', 'ARCHIVADO') then
      raise exception using
        errcode = '55000',
        message = 'Las filas de un corte nominal publicado o archivado son inmutables';
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    select c.estado
    into v_estado
    from public.lista_nominal_cortes c
    where c.lista_nominal_corte_id = new.lista_nominal_corte_id;
    if v_estado in ('PUBLICADO', 'ARCHIVADO') then
      raise exception using
        errcode = '55000',
        message = 'Las filas de un corte nominal publicado o archivado son inmutables';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create trigger lista_nominal_cortes_estado_trg
  before update or delete on public.lista_nominal_cortes
  for each row
  execute function territorial_private.lista_nominal_guardar_estado_corte();

create trigger lista_nominal_secciones_publicadas_trg
  before insert or update or delete on public.lista_nominal_secciones
  for each row
  execute function territorial_private.lista_nominal_guardar_filas_publicadas();

create trigger lista_nominal_correspondencias_publicadas_trg
  before insert or update or delete on public.lista_nominal_correspondencias
  for each row
  execute function territorial_private.lista_nominal_guardar_filas_publicadas();

revoke all on function territorial_private.lista_nominal_guardar_estado_corte()
  from public, anon, authenticated;
revoke all on function territorial_private.lista_nominal_guardar_filas_publicadas()
  from public, anon, authenticated;

alter table public.lista_nominal_cortes enable row level security;
alter table public.lista_nominal_secciones enable row level security;
alter table public.lista_nominal_correspondencias enable row level security;

revoke all on table
  public.lista_nominal_cortes,
  public.lista_nominal_secciones,
  public.lista_nominal_correspondencias
from public, anon, authenticated, service_role;

grant select, insert, update, delete on table
  public.lista_nominal_cortes,
  public.lista_nominal_secciones,
  public.lista_nominal_correspondencias
to service_role;

do $sequence_privileges$
declare
  v_sequence text;
begin
  foreach v_sequence in array array[
    pg_catalog.pg_get_serial_sequence(
      'public.lista_nominal_cortes',
      'lista_nominal_corte_id'
    ),
    pg_catalog.pg_get_serial_sequence(
      'public.lista_nominal_secciones',
      'lista_nominal_seccion_id'
    ),
    pg_catalog.pg_get_serial_sequence(
      'public.lista_nominal_correspondencias',
      'lista_nominal_correspondencia_id'
    )
  ] loop
    if v_sequence is null then
      raise exception 'No se encontró una secuencia identity del subsistema nominal';
    end if;
    execute pg_catalog.format(
      'revoke all on sequence %s from public, anon, authenticated, service_role',
      v_sequence
    );
    execute pg_catalog.format(
      'grant usage, select on sequence %s to service_role',
      v_sequence
    );
  end loop;
end
$sequence_privileges$;

commit;
