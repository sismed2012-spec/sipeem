create or replace function public.rpc_demografia_seccion(
  p_seccion_id bigint,
  p_cartografia_version_id bigint,
  p_anio_censal integer default 2020
)
returns table (
  section_id bigint,
  version_id bigint,
  source jsonb,
  status text,
  coverage jsonb,
  indicators jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  with candidates as (
    select
      1 as priority,
      df.published_at as source_published_at,
      df.demografia_fuente_id as source_id,
      correspondence.seccion_id as section_id,
      correspondence.cartografia_version_id as version_id,
      pg_catalog.jsonb_build_object(
        'provider', df.proveedor,
        'datasetKey', df.conjunto,
        'censusYear', df.anio_censal,
        'sourceGrain', 'SECCION',
        'sourceFrameDate', source.marco_cartografico_fecha,
        'mappingMethod', correspondence.metodo,
        'mappingStatus', correspondence.estado,
        'warnings', correspondence.advertencias
      ) as source,
      'COMPLETE'::text as status,
      pg_catalog.jsonb_build_object(
        'includedLocalities', null,
        'pendingLocalities', null,
        'includedPopulation', source.pobtot,
        'pendingPopulationReference', null,
        'percentage', null,
        'isAdditive', false,
        'method', correspondence.metodo,
        'confidence', correspondence.confianza,
        'warnings', correspondence.advertencias,
        'nullPercentageReason', 'SOURCE_GRAIN_SECTION'
      ) as coverage,
      source.indicadores || pg_catalog.jsonb_strip_nulls(
        pg_catalog.jsonb_build_object(
          'pobtot', source.pobtot,
          'pobfem', source.pobfem,
          'pobmas', source.pobmas,
          'pob0_14', source.pob0_14,
          'pob15_64', source.pob15_64,
          'pob65_mas', source.pob65_mas,
          'p_18ymas', source.p_18ymas,
          'pea', source.pea,
          'pocupada', source.pocupada,
          'p15ym_an', source.p15ym_an,
          'graproes', source.graproes,
          'pder_ss', source.pder_ss,
          'pcon_disc', source.pcon_disc,
          'p3ym_hli', source.p3ym_hli,
          'pob_afro', source.pob_afro,
          'tvivhab', source.tvivhab,
          'vph_aguadv', source.vph_aguadv,
          'vph_drenaj', source.vph_drenaj,
          'vph_c_elec', source.vph_c_elec,
          'vph_cel', source.vph_cel,
          'vph_pc', source.vph_pc,
          'vph_inter', source.vph_inter
        )
      ) as indicators
    from public.demografia_eceg_correspondencias correspondence
    join public.demografia_eceg_secciones source
      on source.demografia_eceg_seccion_id = correspondence.demografia_eceg_seccion_id
     and source.demografia_fuente_id = correspondence.demografia_fuente_id
    join public.demografia_fuentes df
      on df.demografia_fuente_id = source.demografia_fuente_id
    where correspondence.seccion_id = p_seccion_id
      and correspondence.cartografia_version_id = p_cartografia_version_id
      and correspondence.estado in ('VINCULO_HISTORICO', 'DIRECTA')
      and correspondence.publicada_at is not null
      and df.proveedor = 'INEGI'
      and df.conjunto = 'CPV2020_ECEG'
      and df.anio_censal = p_anio_censal
      and df.estado = 'PUBLICADA'

    union all

    select
      2 as priority,
      df.published_at as source_published_at,
      df.demografia_fuente_id as source_id,
      aggregate.seccion_id as section_id,
      aggregate.cartografia_version_id as version_id,
      pg_catalog.jsonb_build_object(
        'provider', df.proveedor,
        'datasetKey', df.conjunto,
        'censusYear', df.anio_censal,
        'sourceGrain', 'LOCALIDAD',
        'sourceFrameDate', null,
        'mappingMethod', aggregate_coverage.metodo,
        'mappingStatus', case
          when aggregate_coverage.localidades_incluidas > 0
            and aggregate_coverage.localidades_pendientes = 0 then 'COMPLETE'
          when aggregate_coverage.localidades_incluidas = 0
            and aggregate_coverage.localidades_pendientes > 0 then 'PENDING'
          else 'PARTIAL'
        end,
        'warnings', aggregate_coverage.advertencias
      ) as source,
      case
        when aggregate_coverage.localidades_incluidas > 0
          and aggregate_coverage.localidades_pendientes = 0 then 'COMPLETE'
        when aggregate_coverage.localidades_incluidas = 0
          and aggregate_coverage.localidades_pendientes > 0 then 'PENDING'
        else 'PARTIAL'
      end as status,
      pg_catalog.jsonb_build_object(
        'includedLocalities', aggregate_coverage.localidades_incluidas,
        'pendingLocalities', aggregate_coverage.localidades_pendientes,
        'includedPopulation', aggregate_coverage.poblacion_incluida,
        'pendingPopulationReference', aggregate_coverage.poblacion_pendiente_referencia,
        'percentage', aggregate_coverage.porcentaje_cobertura,
        'isAdditive', false,
        'method', aggregate_coverage.metodo,
        'confidence', aggregate_coverage.confianza,
        'warnings', aggregate_coverage.advertencias,
        'nullPercentageReason', aggregate_coverage.razon_porcentaje_nulo
      ) as coverage,
      aggregate.indicadores || pg_catalog.jsonb_strip_nulls(
        pg_catalog.jsonb_build_object(
          'pobtot', aggregate.pobtot,
          'pobfem', aggregate.pobfem,
          'pobmas', aggregate.pobmas,
          'pob0_14', aggregate.pob0_14,
          'pob15_64', aggregate.pob15_64,
          'pob65_mas', aggregate.pob65_mas,
          'p_18ymas', aggregate.p_18ymas,
          'pea', aggregate.pea,
          'pocupada', aggregate.pocupada,
          'p15ym_an', aggregate.p15ym_an,
          'graproes', aggregate.graproes,
          'pder_ss', aggregate.pder_ss,
          'pcon_disc', aggregate.pcon_disc,
          'p3ym_hli', aggregate.p3ym_hli,
          'pob_afro', aggregate.pob_afro,
          'tvivhab', aggregate.tvivhab,
          'vph_aguadv', aggregate.vph_aguadv,
          'vph_drenaj', aggregate.vph_drenaj,
          'vph_c_elec', aggregate.vph_c_elec,
          'vph_cel', aggregate.vph_cel,
          'vph_pc', aggregate.vph_pc,
          'vph_inter', aggregate.vph_inter
        )
      ) as indicators
    from public.demografia_secciones aggregate
    join public.demografia_fuentes df
      on df.demografia_fuente_id = aggregate.demografia_fuente_id
    join public.demografia_secciones_cobertura aggregate_coverage
      on aggregate_coverage.demografia_seccion_id = aggregate.demografia_seccion_id
    where aggregate.seccion_id = p_seccion_id
      and aggregate.cartografia_version_id = p_cartografia_version_id
      and df.proveedor = 'INEGI'
      and df.conjunto = 'CPV2020_ITER'
      and df.anio_censal = p_anio_censal
      and df.estado = 'PUBLICADA'
  )
  select
    candidate.section_id,
    candidate.version_id,
    candidate.source,
    candidate.status,
    candidate.coverage,
    candidate.indicators
  from candidates candidate
  order by
    candidate.priority,
    candidate.source_published_at desc nulls last,
    candidate.source_id desc
  limit 1;
$$;

revoke all on function public.rpc_demografia_seccion(bigint, bigint, integer)
  from public, anon, authenticated, service_role;

grant execute on function public.rpc_demografia_seccion(bigint, bigint, integer)
  to service_role;
