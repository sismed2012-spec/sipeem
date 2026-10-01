select jsonb_build_object(
  'rpc_absent', to_regprocedure(
    'public.rpc_demografia_revision_bandeja(bigint,text,text,text,integer,integer)'
  ) is null,
  'published_sources', (
    select count(*)
    from public.demografia_fuentes
    where estado = 'PUBLICADA'
  ),
  'version_4025_published', (
    select count(*)
    from public.cartografia_versiones
    where cartografia_version_id = 4025
      and estado = 'PUBLICADA'
  ),
  'pending_rows', (
    select count(*)
    from public.demografia_localidad_correspondencias
    where cartografia_version_id = 4025
      and estado in ('MULTISECCION', 'REVISION_MANUAL', 'SIN_CORRESPONDENCIA')
  )
) as preflight;
