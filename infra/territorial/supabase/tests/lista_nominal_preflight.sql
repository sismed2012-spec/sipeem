do $preflight$
declare
  v_version_count integer;
  v_section_count integer;
  v_source_count integer;
  v_source_state text;
begin
  if pg_catalog.to_regclass('public.lista_nominal_cortes') is null
     or pg_catalog.to_regclass('public.lista_nominal_secciones') is null
     or pg_catalog.to_regclass('public.lista_nominal_correspondencias') is null then
    raise exception 'Nominal-list schema prerequisites are missing';
  end if;

  select pg_catalog.count(*)::integer
  into v_version_count
  from public.cartografia_versiones
  where cartografia_version_id = 4025
    and clave = 'INE_EDOMEX_2026_PRE_RESECCIONAMIENTO'
    and clave_entidad = '15'
    and estado = 'PUBLICADA'
    and es_predeterminada;
  if v_version_count <> 1 then
    raise exception 'SIPEEM-DEV cartography fingerprint for version 4025 does not match';
  end if;

  select pg_catalog.count(*)::integer
  into v_section_count
  from public.cartografia_secciones
  where cartografia_version_id = 4025;
  if v_section_count <> 7052 then
    raise exception 'Cartography 4025 has % sections; expected 7052', v_section_count;
  end if;

  select pg_catalog.count(*)::integer, pg_catalog.max(estado)
  into v_source_count, v_source_state
  from public.lista_nominal_cortes
  where archivo_sha256 = 'd016713ed9304ae696fbcf875141cf8268799d05468f1afb79bb8785227de161';
  if v_source_count > 1 then
    raise exception 'Source hash is duplicated';
  end if;
  if v_source_state in ('PUBLICADO', 'ARCHIVADO') then
    raise exception 'Source hash already belongs to an immutable % cut', v_source_state;
  end if;
end
$preflight$;

select pg_catalog.jsonb_build_object(
  'expectedProjectRef', 'nppvprbfmjbhwheghipa',
  'cartographyVersionId', 4025,
  'cartographySections', (
    select pg_catalog.count(*)
    from public.cartografia_secciones
    where cartografia_version_id = 4025
  ),
  'sourcePresent', exists (
    select 1
    from public.lista_nominal_cortes
    where archivo_sha256 = 'd016713ed9304ae696fbcf875141cf8268799d05468f1afb79bb8785227de161'
  )
) as preflight;
