do $publish_eceg$
declare
  v_source_id bigint;
  v_source_state text;
  v_count bigint;
  v_population bigint;
  v_published_at timestamptz := pg_catalog.clock_timestamp();
begin
  select demografia_fuente_id, estado
    into strict v_source_id, v_source_state
  from public.demografia_fuentes
  where proveedor = 'INEGI'
    and conjunto = 'CPV2020_ECEG'
    and anio_censal = 2020
    and clave_entidad = '15'
    and archivo_sha256 = '8f409924e3f97fe4f839a8a9a2543d5d364c5ce161b87f9a322e5da4ee2bcc37'
    and filas_total = 6544
    and columnas_total = 220;

  if v_source_state <> 'PREPARADA' then
    raise exception 'ECEG source must be PREPARADA, got %', v_source_state;
  end if;

  select pg_catalog.count(*) into v_count
  from public.cartografia_versiones
  where cartografia_version_id = 4025
    and clave = 'INE_EDOMEX_2026_PRE_RESECCIONAMIENTO'
    and estado = 'PUBLICADA'
    and es_predeterminada;
  if v_count <> 1 then
    raise exception 'Cartography version 4025 is not the expected published default';
  end if;

  select pg_catalog.count(*) into v_count
  from public.cartografia_secciones
  where cartografia_version_id = 4025;
  if v_count <> 7052 then
    raise exception 'Cartography section count %, expected 7052', v_count;
  end if;

  select pg_catalog.count(*) into v_count
  from public.demografia_indicadores
  where demografia_fuente_id = v_source_id;
  if v_count <> 220 then
    raise exception 'Indicator count %, expected 220', v_count;
  end if;

  select pg_catalog.count(*), pg_catalog.sum(pobtot)
    into v_count, v_population
  from public.demografia_eceg_secciones
  where demografia_fuente_id = v_source_id;
  if v_count <> 6544 or v_population <> 16992418 then
    raise exception 'ECEG sections/population %/%, expected 6544/16992418',
      v_count, v_population;
  end if;

  select pg_catalog.count(*) into v_count
  from public.demografia_eceg_secciones
  where demografia_fuente_id = v_source_id
    and pobtot is null;
  if v_count <> 0 then
    raise exception 'ECEG sections missing population: %', v_count;
  end if;

  select pg_catalog.count(distinct clave_municipio) into v_count
  from public.demografia_eceg_secciones
  where demografia_fuente_id = v_source_id;
  if v_count <> 125 then
    raise exception 'ECEG municipality count %, expected 125', v_count;
  end if;

  select pg_catalog.count(distinct numero_distrito_federal) into v_count
  from public.demografia_eceg_secciones
  where demografia_fuente_id = v_source_id;
  if v_count <> 41 then
    raise exception 'ECEG district count %, expected 41', v_count;
  end if;

  select pg_catalog.count(*) into v_count
  from public.demografia_cargas_lotes
  where demografia_fuente_id = v_source_id
    and estado = 'CONFIRMADO'
    and filas_procesadas = filas_esperadas;
  if v_count <> 55 then
    raise exception 'Confirmed ECEG batch count %, expected 55', v_count;
  end if;

  select pg_catalog.count(*) into v_count
  from public.demografia_cargas_lotes
  where demografia_fuente_id = v_source_id
    and (estado <> 'CONFIRMADO' or filas_procesadas <> filas_esperadas);
  if v_count <> 0 then
    raise exception 'ECEG has % incomplete or failed batches', v_count;
  end if;

  select pg_catalog.count(*) into v_count
  from public.demografia_eceg_correspondencias
  where demografia_fuente_id = v_source_id
    and cartografia_version_id = 4025;
  if v_count <> 6544 then
    raise exception 'ECEG correspondence count %, expected 6544', v_count;
  end if;

  select pg_catalog.count(*) into v_count
  from public.demografia_eceg_correspondencias
  where demografia_fuente_id = v_source_id
    and cartografia_version_id = 4025
    and estado = 'VINCULO_HISTORICO';
  if v_count <> 6401 then
    raise exception 'Historical-link count %, expected 6401', v_count;
  end if;

  select pg_catalog.count(*) into v_count
  from public.demografia_eceg_correspondencias
  where demografia_fuente_id = v_source_id
    and cartografia_version_id = 4025
    and estado = 'SIN_EQUIVALENCIA';
  if v_count <> 143 then
    raise exception 'Unmatched ECEG count %, expected 143', v_count;
  end if;

  select pg_catalog.count(*) into v_count
  from public.demografia_eceg_correspondencias
  where demografia_fuente_id = v_source_id
    and cartografia_version_id = 4025
    and publicada_at is not null;
  if v_count <> 0 then
    raise exception 'ECEG has % prematurely published correspondences', v_count;
  end if;

  select pg_catalog.count(*) into v_count
  from (
    select cartografia_seccion_id
    from public.demografia_eceg_correspondencias
    where demografia_fuente_id = v_source_id
      and cartografia_version_id = 4025
      and estado in ('VINCULO_HISTORICO', 'DIRECTA')
    group by cartografia_seccion_id
    having pg_catalog.count(*) > 1
  ) duplicates;
  if v_count <> 0 then
    raise exception 'ECEG has % duplicated publishable destinations', v_count;
  end if;

  select pg_catalog.count(*) into v_count
  from public.cartografia_secciones current_section
  where current_section.cartografia_version_id = 4025
    and not exists (
      select 1
      from public.demografia_eceg_correspondencias correspondence
      where correspondence.demografia_fuente_id = v_source_id
        and correspondence.cartografia_version_id = 4025
        and correspondence.cartografia_seccion_id = current_section.cartografia_seccion_id
        and correspondence.estado in ('VINCULO_HISTORICO', 'DIRECTA')
    );
  if v_count <> 651 then
    raise exception 'Current-only section count %, expected 651', v_count;
  end if;

  update public.demografia_eceg_correspondencias
  set publicada_at = v_published_at,
      updated_at = v_published_at
  where demografia_fuente_id = v_source_id
    and cartografia_version_id = 4025
    and publicada_at is null;
  get diagnostics v_count = row_count;
  if v_count <> 6544 then
    raise exception 'Published correspondence count %, expected 6544', v_count;
  end if;

  update public.demografia_fuentes
  set estado = 'PUBLICADA',
      validated_at = v_published_at,
      published_at = v_published_at,
      updated_at = v_published_at
  where demografia_fuente_id = v_source_id
    and estado = 'PREPARADA';
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'Published source count %, expected 1', v_count;
  end if;
end
$publish_eceg$;
