create function public.rpc_demografia_seccion(
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
  select
    ds.seccion_id as section_id,
    ds.cartografia_version_id as version_id,
    pg_catalog.jsonb_build_object(
      'provider', df.proveedor,
      'datasetKey', df.conjunto,
      'censusYear', df.anio_censal
    ) as source,
    case
      when dc.localidades_incluidas > 0 and dc.localidades_pendientes = 0 then 'COMPLETE'
      when dc.localidades_incluidas = 0 and dc.localidades_pendientes > 0 then 'PENDING'
      else 'PARTIAL'
    end as status,
    pg_catalog.jsonb_build_object(
      'includedLocalities', dc.localidades_incluidas,
      'pendingLocalities', dc.localidades_pendientes,
      'includedPopulation', dc.poblacion_incluida,
      'pendingPopulationReference', dc.poblacion_pendiente_referencia,
      'percentage', dc.porcentaje_cobertura,
      'isAdditive', false,
      'method', dc.metodo,
      'confidence', dc.confianza,
      'warnings', dc.advertencias,
      'nullPercentageReason', dc.razon_porcentaje_nulo
    ) as coverage,
    ds.indicadores || pg_catalog.jsonb_strip_nulls(
      pg_catalog.jsonb_build_object(
        'pobtot', ds.pobtot,
        'pobfem', ds.pobfem,
        'pobmas', ds.pobmas,
        'pob0_14', ds.pob0_14,
        'pob15_64', ds.pob15_64,
        'pob65_mas', ds.pob65_mas,
        'p_18ymas', ds.p_18ymas,
        'pea', ds.pea,
        'pocupada', ds.pocupada,
        'p15ym_an', ds.p15ym_an,
        'graproes', ds.graproes,
        'pder_ss', ds.pder_ss,
        'pcon_disc', ds.pcon_disc,
        'p3ym_hli', ds.p3ym_hli,
        'pob_afro', ds.pob_afro,
        'tvivhab', ds.tvivhab,
        'vph_aguadv', ds.vph_aguadv,
        'vph_drenaj', ds.vph_drenaj,
        'vph_c_elec', ds.vph_c_elec,
        'vph_cel', ds.vph_cel,
        'vph_pc', ds.vph_pc,
        'vph_inter', ds.vph_inter
      )
    ) as indicators
  from public.demografia_secciones ds
  join public.demografia_fuentes df
    on df.demografia_fuente_id = ds.demografia_fuente_id
  join public.demografia_secciones_cobertura dc
    on dc.demografia_seccion_id = ds.demografia_seccion_id
  where ds.seccion_id = p_seccion_id
    and ds.cartografia_version_id = p_cartografia_version_id
    and df.anio_censal = p_anio_censal
    and df.estado = 'PUBLICADA'
  order by df.published_at desc nulls last, df.demografia_fuente_id desc
  limit 1;
$$;

revoke all on function public.rpc_demografia_seccion(bigint, bigint, integer)
  from public, anon, authenticated, service_role;

grant execute on function public.rpc_demografia_seccion(bigint, bigint, integer)
  to service_role;
