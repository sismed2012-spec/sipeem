alter table public.demografia_localidades
  add constraint demografia_localidades_id_fuente_uk
  unique (demografia_localidad_id, demografia_fuente_id);

create function territorial_private.demografia_clasificar_correspondencia(
  p_secciones_candidatas integer,
  p_cobertura_estricta boolean,
  p_ambigua boolean,
  p_tiene_limite boolean
)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_ambigua then 'REVISION_MANUAL'
    when not p_tiene_limite then 'SIN_CORRESPONDENCIA'
    when p_secciones_candidatas = 0 then 'SIN_CORRESPONDENCIA'
    when p_secciones_candidatas > 1 then 'MULTISECCION'
    when p_secciones_candidatas = 1 and p_cobertura_estricta then 'DIRECTA'
    else 'REVISION_MANUAL'
  end;
$$;

create table public.demografia_localidad_correspondencias (
  demografia_localidad_correspondencia_id bigint generated always as identity primary key,
  demografia_fuente_id bigint not null,
  demografia_localidad_id bigint not null,
  cartografia_version_id bigint not null,
  cartografia_localidad_id bigint,
  cartografia_limite_localidad_id bigint,
  cartografia_seccion_id bigint,
  seccion_id bigint,
  metodo text not null,
  estado text not null,
  secciones_candidatas integer not null default 0,
  cobertura_estricta boolean not null default false,
  distancia_metros numeric,
  similitud_nombre numeric,
  confianza numeric not null,
  evidencia jsonb not null default '{}'::jsonb,
  revisada_at timestamptz,
  revisada_por uuid,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint demografia_localidad_correspondencias_localidad_fuente_fk
    foreign key (demografia_localidad_id, demografia_fuente_id)
    references public.demografia_localidades (
      demografia_localidad_id, demografia_fuente_id
    ) on delete cascade,
  constraint demografia_localidad_correspondencias_version_fk
    foreign key (cartografia_version_id)
    references public.cartografia_versiones(cartografia_version_id) on delete restrict,
  constraint demografia_localidad_correspondencias_localidad_cartografica_fk
    foreign key (cartografia_localidad_id)
    references public.cartografia_localidades(cartografia_localidad_id) on delete restrict,
  constraint demografia_localidad_correspondencias_limite_fk
    foreign key (cartografia_limite_localidad_id)
    references public.cartografia_limites_localidad(cartografia_limite_localidad_id) on delete restrict,
  constraint demografia_localidad_correspondencias_seccion_fk
    foreign key (cartografia_seccion_id, cartografia_version_id, seccion_id)
    references public.cartografia_secciones (
      cartografia_seccion_id, cartografia_version_id, seccion_id
    ) on delete restrict,
  constraint demografia_localidad_correspondencias_identidad_uk unique (
    demografia_fuente_id, demografia_localidad_id, cartografia_version_id
  ),
  constraint demografia_localidad_correspondencias_id_version_uk unique (
    demografia_localidad_correspondencia_id, cartografia_version_id
  ),
  constraint demografia_localidad_correspondencias_metodo_ck check (
    metodo in ('CLAVE', 'NOMBRE_COORDENADA', 'ESPACIAL', 'MANUAL', 'SIN_MATCH')
  ),
  constraint demografia_localidad_correspondencias_estado_ck check (
    estado in ('DIRECTA', 'MULTISECCION', 'SIN_CORRESPONDENCIA', 'REVISION_MANUAL')
  ),
  constraint demografia_localidad_correspondencias_candidatas_ck check (
    secciones_candidatas >= 0
  ),
  constraint demografia_localidad_correspondencias_distancia_ck check (
    distancia_metros is null or distancia_metros >= 0
  ),
  constraint demografia_localidad_correspondencias_similitud_ck check (
    similitud_nombre is null or similitud_nombre between 0 and 1
  ),
  constraint demografia_localidad_correspondencias_confianza_ck check (
    confianza between 0 and 1
  ),
  constraint demografia_localidad_correspondencias_evidencia_ck check (
    pg_catalog.jsonb_typeof(evidencia) = 'object'
  ),
  constraint demografia_localidad_correspondencias_revision_ck check (
    (revisada_at is null) = (revisada_por is null)
  ),
  constraint demografia_localidad_correspondencias_estado_integridad_ck check (
    (
      estado = 'DIRECTA'
      and secciones_candidatas = 1
      and cobertura_estricta
      and cartografia_limite_localidad_id is not null
      and cartografia_seccion_id is not null
      and seccion_id is not null
    )
    or (
      estado = 'MULTISECCION'
      and secciones_candidatas > 1
      and cartografia_limite_localidad_id is not null
      and cartografia_seccion_id is null
      and seccion_id is null
    )
    or (
      estado = 'SIN_CORRESPONDENCIA'
      and secciones_candidatas = 0
      and cartografia_seccion_id is null
      and seccion_id is null
    )
    or (
      estado = 'REVISION_MANUAL'
      and cartografia_seccion_id is null
      and seccion_id is null
    )
  )
);

create table public.demografia_localidad_correspondencia_secciones (
  demografia_localidad_correspondencia_seccion_id bigint generated always as identity primary key,
  demografia_localidad_correspondencia_id bigint not null,
  cartografia_seccion_id bigint not null,
  cartografia_version_id bigint not null,
  seccion_id bigint not null,
  tipo_contacto text not null,
  area_interseccion numeric not null,
  proporcion_localidad numeric not null,
  evidencia jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  constraint demografia_correspondencia_secciones_correspondencia_fk
    foreign key (
      demografia_localidad_correspondencia_id, cartografia_version_id
    ) references public.demografia_localidad_correspondencias (
      demografia_localidad_correspondencia_id, cartografia_version_id
    ) on delete cascade,
  constraint demografia_correspondencia_secciones_seccion_fk
    foreign key (cartografia_seccion_id, cartografia_version_id, seccion_id)
    references public.cartografia_secciones (
      cartografia_seccion_id, cartografia_version_id, seccion_id
    )
    on delete restrict,
  constraint demografia_correspondencia_secciones_identidad_uk unique (
    demografia_localidad_correspondencia_id, cartografia_seccion_id
  ),
  constraint demografia_correspondencia_secciones_contacto_ck check (
    tipo_contacto in ('AREA', 'BORDE')
  ),
  constraint demografia_correspondencia_secciones_area_ck check (area_interseccion >= 0),
  constraint demografia_correspondencia_secciones_proporcion_ck check (
    proporcion_localidad between 0 and 1
  ),
  constraint demografia_correspondencia_secciones_evidencia_ck check (
    pg_catalog.jsonb_typeof(evidencia) = 'object'
  )
);

create function territorial_private.demografia_validar_candidatos_correspondencia()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_correspondencia_id bigint := coalesce(
    new.demografia_localidad_correspondencia_id,
    old.demografia_localidad_correspondencia_id
  );
  v_esperadas integer;
  v_reales integer;
  v_estado text;
  v_cartografia_seccion_id bigint;
  v_seleccion_incluida boolean;
begin
  select
    c.secciones_candidatas,
    c.estado,
    c.cartografia_seccion_id
  into v_esperadas, v_estado, v_cartografia_seccion_id
  from public.demografia_localidad_correspondencias c
  where c.demografia_localidad_correspondencia_id = v_correspondencia_id;

  if not found then
    return null;
  end if;

  select
    pg_catalog.count(*)::integer,
    coalesce(
      pg_catalog.bool_or(
        s.cartografia_seccion_id = v_cartografia_seccion_id
      ),
      false
    )
  into v_reales, v_seleccion_incluida
  from public.demografia_localidad_correspondencia_secciones s
  where s.demografia_localidad_correspondencia_id = v_correspondencia_id;

  if v_reales <> v_esperadas then
    raise exception using
      errcode = '23514',
      message = pg_catalog.format(
        'Correspondencia %s declara %s secciones candidatas pero tiene %s',
        v_correspondencia_id,
        v_esperadas,
        v_reales
      );
  end if;

  if v_estado = 'DIRECTA' and not v_seleccion_incluida then
    raise exception using
      errcode = '23514',
      message = pg_catalog.format(
        'La sección seleccionada no pertenece a los candidatos de la correspondencia %s',
        v_correspondencia_id
      );
  end if;

  return null;
end;
$$;

create constraint trigger demografia_correspondencias_validar_candidatos_parent_trg
  after insert or update
  on public.demografia_localidad_correspondencias
  deferrable initially deferred
  for each row
  execute function territorial_private.demografia_validar_candidatos_correspondencia();

create constraint trigger demografia_correspondencias_validar_candidatos_child_trg
  after insert or update or delete
  on public.demografia_localidad_correspondencia_secciones
  deferrable initially deferred
  for each row
  execute function territorial_private.demografia_validar_candidatos_correspondencia();

revoke all on function territorial_private.demografia_validar_candidatos_correspondencia()
  from public, anon, authenticated;

create table public.demografia_secciones (
  demografia_seccion_id bigint generated always as identity primary key,
  demografia_fuente_id bigint not null
    references public.demografia_fuentes(demografia_fuente_id) on delete cascade,
  cartografia_version_id bigint not null,
  cartografia_seccion_id bigint not null,
  seccion_id bigint not null,
  localidades_incluidas integer not null,
  poblacion_incluida bigint,
  pobtot bigint,
  pobfem bigint,
  pobmas bigint,
  pob0_14 bigint,
  pob15_64 bigint,
  pob65_mas bigint,
  p_18ymas bigint,
  pea bigint,
  pocupada bigint,
  p15ym_an bigint,
  graproes numeric(8, 3),
  pder_ss bigint,
  pcon_disc bigint,
  p3ym_hli bigint,
  pob_afro bigint,
  tvivhab bigint,
  vph_aguadv bigint,
  vph_drenaj bigint,
  vph_c_elec bigint,
  vph_cel bigint,
  vph_pc bigint,
  vph_inter bigint,
  indicadores jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default pg_catalog.now(),
  constraint demografia_secciones_seccion_fk
    foreign key (cartografia_seccion_id, cartografia_version_id, seccion_id)
    references public.cartografia_secciones (
      cartografia_seccion_id, cartografia_version_id, seccion_id
    ) on delete restrict,
  constraint demografia_secciones_identidad_uk unique (
    demografia_fuente_id, cartografia_version_id, seccion_id
  ),
  constraint demografia_secciones_localidades_ck check (localidades_incluidas >= 0),
  constraint demografia_secciones_poblacion_ck check (
    poblacion_incluida is null or poblacion_incluida >= 0
  ),
  constraint demografia_secciones_pobtot_ck check (
    pobtot is null or (pobtot >= 0 and pobtot is not distinct from poblacion_incluida)
  ),
  constraint demografia_secciones_conteos_ck check (
    (pobfem is null or pobfem >= 0)
    and (pobmas is null or pobmas >= 0)
    and (pob0_14 is null or pob0_14 >= 0)
    and (pob15_64 is null or pob15_64 >= 0)
    and (pob65_mas is null or pob65_mas >= 0)
    and (p_18ymas is null or p_18ymas >= 0)
    and (pea is null or pea >= 0)
    and (pocupada is null or pocupada >= 0)
    and (p15ym_an is null or p15ym_an >= 0)
    and (graproes is null or graproes >= 0)
    and (pder_ss is null or pder_ss >= 0)
    and (pcon_disc is null or pcon_disc >= 0)
    and (p3ym_hli is null or p3ym_hli >= 0)
    and (pob_afro is null or pob_afro >= 0)
    and (tvivhab is null or tvivhab >= 0)
    and (vph_aguadv is null or vph_aguadv >= 0)
    and (vph_drenaj is null or vph_drenaj >= 0)
    and (vph_c_elec is null or vph_c_elec >= 0)
    and (vph_cel is null or vph_cel >= 0)
    and (vph_pc is null or vph_pc >= 0)
    and (vph_inter is null or vph_inter >= 0)
  ),
  constraint demografia_secciones_indicadores_ck check (
    pg_catalog.jsonb_typeof(indicadores) = 'object'
  )
);

create table public.demografia_secciones_cobertura (
  demografia_seccion_id bigint primary key
    references public.demografia_secciones(demografia_seccion_id) on delete cascade,
  localidades_incluidas integer not null,
  localidades_pendientes integer not null,
  poblacion_incluida bigint,
  poblacion_pendiente_referencia bigint,
  referencia_pendiente_defendible boolean not null default false,
  porcentaje_cobertura numeric(7, 4),
  razon_porcentaje_nulo text,
  metodo text not null,
  confianza numeric not null,
  advertencias jsonb not null default '[]'::jsonb,
  calculated_at timestamptz not null default pg_catalog.now(),
  constraint demografia_secciones_cobertura_localidades_ck check (
    localidades_incluidas >= 0 and localidades_pendientes >= 0
    and localidades_incluidas + localidades_pendientes > 0
  ),
  constraint demografia_secciones_cobertura_poblacion_ck check (
    (poblacion_incluida is null or poblacion_incluida >= 0)
    and (poblacion_pendiente_referencia is null or poblacion_pendiente_referencia >= 0)
  ),
  constraint demografia_secciones_cobertura_referencia_ck check (
    (referencia_pendiente_defendible and poblacion_pendiente_referencia is not null)
    or (not referencia_pendiente_defendible and poblacion_pendiente_referencia is null)
  ),
  constraint demografia_secciones_cobertura_porcentaje_ck check (
    porcentaje_cobertura is null or porcentaje_cobertura between 0 and 100
  ),
  constraint demografia_secciones_cobertura_razon_ck check (
    (porcentaje_cobertura is null and nullif(pg_catalog.btrim(razon_porcentaje_nulo), '') is not null)
    or (porcentaje_cobertura is not null and razon_porcentaje_nulo is null)
  ),
  constraint demografia_secciones_cobertura_metodo_ck check (
    metodo = 'SOLO_DIRECTAS'
  ),
  constraint demografia_secciones_cobertura_confianza_ck check (
    confianza between 0 and 1
  ),
  constraint demografia_secciones_cobertura_advertencias_ck check (
    pg_catalog.jsonb_typeof(advertencias) = 'array'
  )
);

create index demografia_correspondencias_version_estado_idx
  on public.demografia_localidad_correspondencias (
    cartografia_version_id, estado, demografia_fuente_id
  );

create index demografia_correspondencias_localidad_cartografica_idx
  on public.demografia_localidad_correspondencias (cartografia_localidad_id)
  where cartografia_localidad_id is not null;

create index demografia_correspondencia_secciones_seccion_idx
  on public.demografia_localidad_correspondencia_secciones (seccion_id);

create index demografia_secciones_version_seccion_idx
  on public.demografia_secciones (cartografia_version_id, seccion_id);

alter table public.demografia_localidad_correspondencias enable row level security;
alter table public.demografia_localidad_correspondencia_secciones enable row level security;
alter table public.demografia_secciones enable row level security;
alter table public.demografia_secciones_cobertura enable row level security;

revoke all on table
  public.demografia_localidad_correspondencias,
  public.demografia_localidad_correspondencia_secciones,
  public.demografia_secciones,
  public.demografia_secciones_cobertura
from public, anon, authenticated, service_role;

grant select, insert, update, delete on table
  public.demografia_localidad_correspondencias,
  public.demografia_localidad_correspondencia_secciones,
  public.demografia_secciones,
  public.demografia_secciones_cobertura
to service_role;

do $sequence_privileges$
declare
  v_sequence text;
begin
  foreach v_sequence in array array[
    pg_catalog.pg_get_serial_sequence(
      'public.demografia_localidad_correspondencias',
      'demografia_localidad_correspondencia_id'
    ),
    pg_catalog.pg_get_serial_sequence(
      'public.demografia_localidad_correspondencia_secciones',
      'demografia_localidad_correspondencia_seccion_id'
    ),
    pg_catalog.pg_get_serial_sequence(
      'public.demografia_secciones',
      'demografia_seccion_id'
    )
  ] loop
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

revoke all on function territorial_private.demografia_clasificar_correspondencia(
  integer, boolean, boolean, boolean
) from public, anon, authenticated, service_role;

grant execute on function territorial_private.demografia_clasificar_correspondencia(
  integer, boolean, boolean, boolean
) to service_role;
