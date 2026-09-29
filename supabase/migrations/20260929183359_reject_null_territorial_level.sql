begin;

-- Correct the SQL boundary independently of the authenticated HTTP parser.
create or replace function public.rpc_indicadores_territoriales(
  p_nivel text,
  p_cartografia_version_id bigint,
  p_lista_nominal_corte_id bigint default null,
  p_demografia_fuente_id bigint default null
)
returns table (
  nivel text,
  territorio_id bigint,
  cartografia_territorio_id bigint,
  clave text,
  nombre text,
  cartografia_version_id bigint,
  lista_nominal_corte_id bigint,
  lista_nominal_fecha_corte date,
  demografia_fuente_id bigint,
  demografia_anio_censal smallint,
  secciones_total bigint,
  secciones_nominal bigint,
  secciones_demografia bigint,
  cobertura_fuente_nominal_pct numeric,
  cobertura_fuente_demografia_pct numeric,
  padron_hombres bigint,
  padron_mujeres bigint,
  padron_no_binario bigint,
  padron_total bigint,
  lista_hombres bigint,
  lista_mujeres bigint,
  lista_no_binario bigint,
  lista_total bigint,
  diferencia bigint,
  cobertura_padron_pct numeric,
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
  calidad_metricas jsonb
)
language plpgsql
stable
security invoker
set search_path = ''
set enable_nestloop = 'off'
set work_mem = '32MB'
as $$
declare
  v_clave_entidad text;
  v_lista_nominal_corte_id bigint;
  v_lista_nominal_fecha_corte date;
  v_demografia_fuente_id bigint;
  v_demografia_anio_censal smallint;
begin
  if p_nivel is null
     or p_nivel not in ('MUNICIPIO', 'DISTRITO_LOCAL', 'DISTRITO_FEDERAL') then
    raise exception using
      errcode = '22023',
      message = 'nivel territorial inválido';
  end if;

  select version.clave_entidad
  into v_clave_entidad
  from public.cartografia_versiones version
  where version.cartografia_version_id = p_cartografia_version_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'versión cartográfica no encontrada';
  end if;

  if p_lista_nominal_corte_id is null then
    select cut.lista_nominal_corte_id, cut.fecha_corte
    into v_lista_nominal_corte_id, v_lista_nominal_fecha_corte
    from public.lista_nominal_cortes cut
    where cut.estado = 'PUBLICADO'
      and cut.clave_entidad = v_clave_entidad
      and exists (
        select 1
        from public.lista_nominal_correspondencias correspondence
        where correspondence.lista_nominal_corte_id = cut.lista_nominal_corte_id
          and correspondence.cartografia_version_id = p_cartografia_version_id
          and correspondence.estado = 'VINCULADA'
      )
    order by cut.fecha_corte desc, cut.lista_nominal_corte_id desc
    limit 1;
  else
    select cut.lista_nominal_corte_id, cut.fecha_corte
    into v_lista_nominal_corte_id, v_lista_nominal_fecha_corte
    from public.lista_nominal_cortes cut
    where cut.lista_nominal_corte_id = p_lista_nominal_corte_id
      and cut.estado = 'PUBLICADO'
      and cut.clave_entidad = v_clave_entidad
      and exists (
        select 1
        from public.lista_nominal_correspondencias correspondence
        where correspondence.lista_nominal_corte_id = cut.lista_nominal_corte_id
          and correspondence.cartografia_version_id = p_cartografia_version_id
          and correspondence.estado = 'VINCULADA'
      );
  end if;

  if v_lista_nominal_corte_id is null then
    raise exception using
      errcode = '22023',
      message = 'corte nominal publicado incompatible con la versión';
  end if;

  if p_demografia_fuente_id is null then
    select source.demografia_fuente_id, source.anio_censal
    into v_demografia_fuente_id, v_demografia_anio_censal
    from public.demografia_fuentes source
    where source.estado = 'PUBLICADA'
      and source.conjunto = 'CPV2020_ECEG'
      and source.clave_entidad = v_clave_entidad
      and exists (
        select 1
        from public.demografia_eceg_correspondencias correspondence
        where correspondence.demografia_fuente_id = source.demografia_fuente_id
          and correspondence.cartografia_version_id = p_cartografia_version_id
          and correspondence.estado in ('VINCULO_HISTORICO', 'DIRECTA')
          and correspondence.publicada_at is not null
      )
    order by
      source.anio_censal desc,
      source.published_at desc,
      source.demografia_fuente_id desc
    limit 1;
  else
    select source.demografia_fuente_id, source.anio_censal
    into v_demografia_fuente_id, v_demografia_anio_censal
    from public.demografia_fuentes source
    where source.demografia_fuente_id = p_demografia_fuente_id
      and source.estado = 'PUBLICADA'
      and source.conjunto = 'CPV2020_ECEG'
      and source.clave_entidad = v_clave_entidad
      and exists (
        select 1
        from public.demografia_eceg_correspondencias correspondence
        where correspondence.demografia_fuente_id = source.demografia_fuente_id
          and correspondence.cartografia_version_id = p_cartografia_version_id
          and correspondence.estado in ('VINCULO_HISTORICO', 'DIRECTA')
          and correspondence.publicada_at is not null
      );
  end if;

  if v_demografia_fuente_id is null then
    raise exception using
      errcode = '22023',
      message = 'fuente demográfica ECEG publicada incompatible con la versión';
  end if;

  return query
  with selected_version as (
    select version.cartografia_version_id, version.clave_entidad
    from public.cartografia_versiones version
    where version.cartografia_version_id = p_cartografia_version_id
  ),
  selected_cut as (
    select cut.lista_nominal_corte_id, cut.fecha_corte
    from public.lista_nominal_cortes cut
    where cut.lista_nominal_corte_id = v_lista_nominal_corte_id
  ),
  selected_source as (
    select source.demografia_fuente_id, source.anio_censal
    from public.demografia_fuentes source
    where source.demografia_fuente_id = v_demografia_fuente_id
  ),
  nominal_by_section as (
    select
      correspondence.cartografia_seccion_id,
      pg_catalog.sum(source.padron_hombres)::bigint as padron_hombres,
      pg_catalog.sum(source.padron_mujeres)::bigint as padron_mujeres,
      pg_catalog.sum(source.padron_no_binario)::bigint as padron_no_binario,
      pg_catalog.sum(source.padron_total)::bigint as padron_total,
      pg_catalog.sum(source.lista_hombres)::bigint as lista_hombres,
      pg_catalog.sum(source.lista_mujeres)::bigint as lista_mujeres,
      pg_catalog.sum(source.lista_no_binario)::bigint as lista_no_binario,
      pg_catalog.sum(source.lista_total)::bigint as lista_total,
      pg_catalog.sum(source.diferencia)::bigint as diferencia
    from selected_cut cut
    join public.lista_nominal_correspondencias correspondence
      on correspondence.lista_nominal_corte_id = cut.lista_nominal_corte_id
     and correspondence.cartografia_version_id = p_cartografia_version_id
     and correspondence.estado = 'VINCULADA'
    join public.lista_nominal_secciones source
      on source.lista_nominal_corte_id = correspondence.lista_nominal_corte_id
     and source.lista_nominal_seccion_id = correspondence.lista_nominal_seccion_id
    group by correspondence.cartografia_seccion_id
  ),
  demography_by_section as (
    select
      correspondence.cartografia_seccion_id,
      pg_catalog.sum(source.pobtot)::bigint as pobtot,
      pg_catalog.sum(source.pobfem)::bigint as pobfem,
      pg_catalog.sum(source.pobmas)::bigint as pobmas,
      pg_catalog.sum(source.pob0_14)::bigint as pob0_14,
      pg_catalog.sum(source.pob15_64)::bigint as pob15_64,
      pg_catalog.sum(source.pob65_mas)::bigint as pob65_mas,
      pg_catalog.sum(source.p_18ymas)::bigint as p_18ymas,
      pg_catalog.sum(source.pea)::bigint as pea,
      pg_catalog.sum(source.pocupada)::bigint as pocupada,
      pg_catalog.sum(source.p15ym_an)::bigint as p15ym_an,
      pg_catalog.sum(source.pder_ss)::bigint as pder_ss,
      pg_catalog.sum(source.pcon_disc)::bigint as pcon_disc,
      pg_catalog.sum(source.p3ym_hli)::bigint as p3ym_hli,
      pg_catalog.sum(source.pob_afro)::bigint as pob_afro,
      pg_catalog.sum(source.tvivhab)::bigint as tvivhab,
      pg_catalog.sum(source.vph_aguadv)::bigint as vph_aguadv,
      pg_catalog.sum(source.vph_drenaj)::bigint as vph_drenaj,
      pg_catalog.sum(source.vph_c_elec)::bigint as vph_c_elec,
      pg_catalog.sum(source.vph_cel)::bigint as vph_cel,
      pg_catalog.sum(source.vph_pc)::bigint as vph_pc,
      pg_catalog.sum(source.vph_inter)::bigint as vph_inter
    from selected_source selected
    join public.demografia_eceg_correspondencias correspondence
      on correspondence.demografia_fuente_id = selected.demografia_fuente_id
     and correspondence.cartografia_version_id = p_cartografia_version_id
     and correspondence.estado in ('VINCULO_HISTORICO', 'DIRECTA')
     and correspondence.publicada_at is not null
    join public.demografia_eceg_secciones source
      on source.demografia_fuente_id = correspondence.demografia_fuente_id
     and source.demografia_eceg_seccion_id = correspondence.demografia_eceg_seccion_id
    group by correspondence.cartografia_seccion_id
  ),
  section_facts as (
    select
      case p_nivel
        when 'MUNICIPIO' then section.municipio_id
        when 'DISTRITO_LOCAL' then section.distrito_local_id
        else section.distrito_federal_id
      end as territory_id,
      case p_nivel
        when 'MUNICIPIO' then section.cartografia_municipio_id
        when 'DISTRITO_LOCAL' then section.cartografia_distrito_local_id
        else section.cartografia_distrito_federal_id
      end as cartography_territory_id,
      case p_nivel
        when 'MUNICIPIO' then municipality.clave_municipio
        when 'DISTRITO_LOCAL' then pg_catalog.lpad(local_district.numero::text, 3, '0')
        else pg_catalog.lpad(federal_district.numero::text, 3, '0')
      end as territory_key,
      case p_nivel
        when 'MUNICIPIO' then municipality.nombre
        when 'DISTRITO_LOCAL' then local_district.nombre
        else federal_district.nombre
      end as territory_name,
      nominal.cartografia_seccion_id as nominal_section_id,
      demographic.cartografia_seccion_id as demographic_section_id,
      nominal.padron_hombres,
      nominal.padron_mujeres,
      nominal.padron_no_binario,
      nominal.padron_total,
      nominal.lista_hombres,
      nominal.lista_mujeres,
      nominal.lista_no_binario,
      nominal.lista_total,
      nominal.diferencia,
      demographic.pobtot,
      demographic.pobfem,
      demographic.pobmas,
      demographic.pob0_14,
      demographic.pob15_64,
      demographic.pob65_mas,
      demographic.p_18ymas,
      demographic.pea,
      demographic.pocupada,
      demographic.p15ym_an,
      demographic.pder_ss,
      demographic.pcon_disc,
      demographic.p3ym_hli,
      demographic.pob_afro,
      demographic.tvivhab,
      demographic.vph_aguadv,
      demographic.vph_drenaj,
      demographic.vph_c_elec,
      demographic.vph_cel,
      demographic.vph_pc,
      demographic.vph_inter
    from selected_version version
    join public.cartografia_secciones section
      on section.cartografia_version_id = version.cartografia_version_id
    join public.cartografia_municipios municipality
      on municipality.cartografia_municipio_id = section.cartografia_municipio_id
     and municipality.cartografia_version_id = section.cartografia_version_id
     and municipality.municipio_id = section.municipio_id
    join public.cartografia_distritos_locales local_district
      on local_district.cartografia_distrito_local_id = section.cartografia_distrito_local_id
     and local_district.cartografia_version_id = section.cartografia_version_id
     and local_district.distrito_local_id = section.distrito_local_id
    join public.cartografia_distritos_federales federal_district
      on federal_district.cartografia_distrito_federal_id = section.cartografia_distrito_federal_id
     and federal_district.cartografia_version_id = section.cartografia_version_id
     and federal_district.distrito_federal_id = section.distrito_federal_id
    left join nominal_by_section nominal
      on nominal.cartografia_seccion_id = section.cartografia_seccion_id
    left join demography_by_section demographic
      on demographic.cartografia_seccion_id = section.cartografia_seccion_id
  )
  select
    p_nivel,
    facts.territory_id,
    facts.cartography_territory_id,
    facts.territory_key,
    facts.territory_name,
    p_cartografia_version_id,
    v_lista_nominal_corte_id,
    v_lista_nominal_fecha_corte,
    v_demografia_fuente_id,
    v_demografia_anio_censal,
    pg_catalog.count(*)::bigint,
    pg_catalog.count(facts.nominal_section_id)::bigint,
    pg_catalog.count(facts.demographic_section_id)::bigint,
    pg_catalog.round(
      pg_catalog.count(facts.nominal_section_id)::numeric * 100
      / pg_catalog.count(*)::numeric,
      6
    ),
    pg_catalog.round(
      pg_catalog.count(facts.demographic_section_id)::numeric * 100
      / pg_catalog.count(*)::numeric,
      6
    ),
    case when pg_catalog.count(facts.nominal_section_id) = 0 then null
      else pg_catalog.sum(facts.padron_hombres)::bigint end,
    case when pg_catalog.count(facts.nominal_section_id) = 0 then null
      else pg_catalog.sum(facts.padron_mujeres)::bigint end,
    case when pg_catalog.count(facts.nominal_section_id) = 0 then null
      else pg_catalog.sum(facts.padron_no_binario)::bigint end,
    case when pg_catalog.count(facts.nominal_section_id) = 0 then null
      else pg_catalog.sum(facts.padron_total)::bigint end,
    case when pg_catalog.count(facts.nominal_section_id) = 0 then null
      else pg_catalog.sum(facts.lista_hombres)::bigint end,
    case when pg_catalog.count(facts.nominal_section_id) = 0 then null
      else pg_catalog.sum(facts.lista_mujeres)::bigint end,
    case when pg_catalog.count(facts.nominal_section_id) = 0 then null
      else pg_catalog.sum(facts.lista_no_binario)::bigint end,
    case when pg_catalog.count(facts.nominal_section_id) = 0 then null
      else pg_catalog.sum(facts.lista_total)::bigint end,
    case when pg_catalog.count(facts.nominal_section_id) = 0 then null
      else pg_catalog.sum(facts.diferencia)::bigint end,
    case
      when pg_catalog.count(facts.nominal_section_id) = 0 then null
      when pg_catalog.sum(facts.padron_total) = 0 then 0::numeric
      else pg_catalog.round(
        pg_catalog.sum(facts.lista_total)::numeric * 100
        / pg_catalog.sum(facts.padron_total)::numeric,
        8
      )
    end,
    pg_catalog.sum(facts.pobtot)::bigint,
    pg_catalog.sum(facts.pobfem)::bigint,
    pg_catalog.sum(facts.pobmas)::bigint,
    pg_catalog.sum(facts.pob0_14)::bigint,
    pg_catalog.sum(facts.pob15_64)::bigint,
    pg_catalog.sum(facts.pob65_mas)::bigint,
    pg_catalog.sum(facts.p_18ymas)::bigint,
    pg_catalog.sum(facts.pea)::bigint,
    pg_catalog.sum(facts.pocupada)::bigint,
    pg_catalog.sum(facts.p15ym_an)::bigint,
    pg_catalog.sum(facts.pder_ss)::bigint,
    pg_catalog.sum(facts.pcon_disc)::bigint,
    pg_catalog.sum(facts.p3ym_hli)::bigint,
    pg_catalog.sum(facts.pob_afro)::bigint,
    pg_catalog.sum(facts.tvivhab)::bigint,
    pg_catalog.sum(facts.vph_aguadv)::bigint,
    pg_catalog.sum(facts.vph_drenaj)::bigint,
    pg_catalog.sum(facts.vph_c_elec)::bigint,
    pg_catalog.sum(facts.vph_cel)::bigint,
    pg_catalog.sum(facts.vph_pc)::bigint,
    pg_catalog.sum(facts.vph_inter)::bigint,
    pg_catalog.jsonb_build_object(
      'pobtot', pg_catalog.count(facts.pobtot),
      'pobfem', pg_catalog.count(facts.pobfem),
      'pobmas', pg_catalog.count(facts.pobmas),
      'pob0_14', pg_catalog.count(facts.pob0_14),
      'pob15_64', pg_catalog.count(facts.pob15_64),
      'pob65_mas', pg_catalog.count(facts.pob65_mas),
      'p_18ymas', pg_catalog.count(facts.p_18ymas),
      'pea', pg_catalog.count(facts.pea),
      'pocupada', pg_catalog.count(facts.pocupada),
      'p15ym_an', pg_catalog.count(facts.p15ym_an),
      'pder_ss', pg_catalog.count(facts.pder_ss),
      'pcon_disc', pg_catalog.count(facts.pcon_disc),
      'p3ym_hli', pg_catalog.count(facts.p3ym_hli),
      'pob_afro', pg_catalog.count(facts.pob_afro),
      'tvivhab', pg_catalog.count(facts.tvivhab),
      'vph_aguadv', pg_catalog.count(facts.vph_aguadv),
      'vph_drenaj', pg_catalog.count(facts.vph_drenaj),
      'vph_c_elec', pg_catalog.count(facts.vph_c_elec),
      'vph_cel', pg_catalog.count(facts.vph_cel),
      'vph_pc', pg_catalog.count(facts.vph_pc),
      'vph_inter', pg_catalog.count(facts.vph_inter)
    )
  from section_facts facts
  group by
    facts.territory_id,
    facts.cartography_territory_id,
    facts.territory_key,
    facts.territory_name
  order by facts.territory_key;
end;
$$;

revoke all on function public.rpc_indicadores_territoriales(
  text, bigint, bigint, bigint
) from public, anon, authenticated;

grant execute on function public.rpc_indicadores_territoriales(
  text, bigint, bigint, bigint
) to service_role;

commit;
