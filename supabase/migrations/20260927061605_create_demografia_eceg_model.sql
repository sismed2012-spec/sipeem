alter table public.demografia_cargas_lotes
  drop constraint demografia_cargas_lotes_etapa_ck;

alter table public.demografia_cargas_lotes
  add constraint demografia_cargas_lotes_etapa_ck check (
    etapa in (
      'FUENTE', 'INDICADORES', 'LOCALIDADES', 'CORRESPONDENCIAS',
      'AGREGACION', 'SECCIONES_ECEG', 'CORRESPONDENCIAS_ECEG'
    )
  );

create table public.demografia_eceg_secciones (
  demografia_eceg_seccion_id bigint generated always as identity primary key,
  demografia_fuente_id bigint not null
    references public.demografia_fuentes(demografia_fuente_id) on delete cascade,
  clave_entidad text not null,
  nombre_entidad text not null,
  numero_distrito_federal text not null,
  grupo_complejidad text,
  clave_municipio text not null,
  nombre_municipio text not null,
  numero_seccion text not null,
  marco_cartografico_fecha date not null,
  filas_origen jsonb not null,
  registro_sha256 text not null,
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
  estados_dato jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint demografia_eceg_secciones_clave_uk unique (
    demografia_fuente_id, clave_entidad, numero_seccion
  ),
  constraint demografia_eceg_secciones_id_fuente_uk unique (
    demografia_eceg_seccion_id, demografia_fuente_id
  ),
  constraint demografia_eceg_secciones_entidad_ck check (
    clave_entidad ~ '^[0-9]{2}$'
  ),
  constraint demografia_eceg_secciones_distrito_ck check (
    numero_distrito_federal ~ '^[0-9]{3}$'
  ),
  constraint demografia_eceg_secciones_grupo_ck check (
    grupo_complejidad is null
    or pg_catalog.btrim(grupo_complejidad) <> ''
  ),
  constraint demografia_eceg_secciones_municipio_ck check (
    clave_municipio ~ '^[0-9]{3}$'
  ),
  constraint demografia_eceg_secciones_numero_ck check (
    numero_seccion ~ '^[0-9]{4}$' and numero_seccion <> '0000'
  ),
  constraint demografia_eceg_secciones_marco_ck check (
    marco_cartografico_fecha between date '1900-01-01' and date '2200-12-31'
  ),
  constraint demografia_eceg_secciones_filas_ck check (
    pg_catalog.jsonb_typeof(filas_origen) = 'object'
    and filas_origen <> '{}'::jsonb
  ),
  constraint demografia_eceg_secciones_sha_ck check (
    registro_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint demografia_eceg_secciones_conteos_ck check (
    (pobtot is null or pobtot >= 0)
    and (pobfem is null or pobfem >= 0)
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
  constraint demografia_eceg_secciones_indicadores_ck check (
    pg_catalog.jsonb_typeof(indicadores) = 'object'
  ),
  constraint demografia_eceg_secciones_estados_ck check (
    pg_catalog.jsonb_typeof(estados_dato) = 'object'
  )
);

create table public.demografia_eceg_correspondencias (
  demografia_eceg_correspondencia_id bigint generated always as identity primary key,
  demografia_fuente_id bigint not null,
  demografia_eceg_seccion_id bigint not null,
  cartografia_version_id bigint not null,
  cartografia_seccion_id bigint,
  seccion_id bigint,
  metodo text not null,
  estado text not null,
  confianza numeric not null,
  evidencia jsonb not null default '{}'::jsonb,
  advertencias jsonb not null default '[]'::jsonb,
  publicada_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint demografia_eceg_correspondencias_origen_fk
    foreign key (demografia_eceg_seccion_id, demografia_fuente_id)
    references public.demografia_eceg_secciones (
      demografia_eceg_seccion_id, demografia_fuente_id
    ) on delete cascade,
  constraint demografia_eceg_correspondencias_version_fk
    foreign key (cartografia_version_id)
    references public.cartografia_versiones(cartografia_version_id) on delete restrict,
  constraint demografia_eceg_correspondencias_destino_fk
    foreign key (cartografia_seccion_id, cartografia_version_id, seccion_id)
    references public.cartografia_secciones (
      cartografia_seccion_id, cartografia_version_id, seccion_id
    ) on delete restrict,
  constraint demografia_eceg_correspondencias_identidad_uk unique (
    demografia_fuente_id, demografia_eceg_seccion_id, cartografia_version_id
  ),
  constraint demografia_eceg_correspondencias_metodo_ck check (
    metodo in ('CLAVE_NUMERICA', 'EQUIVALENCIA_OFICIAL', 'RECOMPUTADA', 'SIN_MATCH')
  ),
  constraint demografia_eceg_correspondencias_estado_ck check (
    estado in ('VINCULO_HISTORICO', 'DIRECTA', 'SIN_EQUIVALENCIA', 'REVISION_MANUAL')
  ),
  constraint demografia_eceg_correspondencias_confianza_ck check (
    confianza between 0 and 1
  ),
  constraint demografia_eceg_correspondencias_evidencia_ck check (
    pg_catalog.jsonb_typeof(evidencia) = 'object'
  ),
  constraint demografia_eceg_correspondencias_advertencias_ck check (
    pg_catalog.jsonb_typeof(advertencias) = 'array'
  ),
  constraint demografia_eceg_correspondencias_estado_integridad_ck check (
    (
      estado = 'VINCULO_HISTORICO'
      and metodo = 'CLAVE_NUMERICA'
      and cartografia_seccion_id is not null
      and seccion_id is not null
    )
    or (
      estado = 'DIRECTA'
      and metodo in ('EQUIVALENCIA_OFICIAL', 'RECOMPUTADA')
      and cartografia_seccion_id is not null
      and seccion_id is not null
    )
    or (
      estado = 'SIN_EQUIVALENCIA'
      and metodo = 'SIN_MATCH'
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

create index demografia_eceg_secciones_fuente_municipio_idx
  on public.demografia_eceg_secciones (
    demografia_fuente_id, clave_entidad, clave_municipio, numero_seccion
  );

create index demografia_eceg_correspondencias_version_estado_idx
  on public.demografia_eceg_correspondencias (
    cartografia_version_id, estado, demografia_fuente_id
  );

create unique index demografia_eceg_correspondencias_destino_publicable_uk
  on public.demografia_eceg_correspondencias (
    demografia_fuente_id, cartografia_version_id, cartografia_seccion_id
  )
  where estado in ('VINCULO_HISTORICO', 'DIRECTA');

alter table public.demografia_eceg_secciones enable row level security;
alter table public.demografia_eceg_correspondencias enable row level security;

revoke all on table
  public.demografia_eceg_secciones,
  public.demografia_eceg_correspondencias
from public, anon, authenticated, service_role;

grant select, insert, update, delete on table
  public.demografia_eceg_secciones,
  public.demografia_eceg_correspondencias
to service_role;

do $sequences$
declare
  v_sequence text;
begin
  foreach v_sequence in array array[
    pg_catalog.pg_get_serial_sequence(
      'public.demografia_eceg_secciones', 'demografia_eceg_seccion_id'
    ),
    pg_catalog.pg_get_serial_sequence(
      'public.demografia_eceg_correspondencias',
      'demografia_eceg_correspondencia_id'
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
$sequences$;
