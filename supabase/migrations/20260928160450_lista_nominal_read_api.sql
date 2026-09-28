begin;

create function public.rpc_lista_nominal_seccion(
  p_seccion_id bigint,
  p_cartografia_version_id bigint,
  p_fecha_corte date default null
)
returns table (
  section_id bigint,
  version_id bigint,
  cutoff_date date,
  source jsonb,
  status text,
  padron jsonb,
  nominal jsonb,
  difference integer,
  coverage double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  with selected_cut as (
    select cut.*
    from public.lista_nominal_cortes cut
    where (
      p_fecha_corte is null
      and cut.estado = 'PUBLICADO'
    ) or (
      p_fecha_corte is not null
      and cut.fecha_corte = p_fecha_corte
      and cut.estado in ('PUBLICADO', 'ARCHIVADO')
    )
    order by
      cut.fecha_corte desc,
      (cut.estado = 'PUBLICADO') desc,
      cut.lista_nominal_corte_id desc
    limit 1
  )
  select
    correspondence.seccion_id as section_id,
    correspondence.cartografia_version_id as version_id,
    cut.fecha_corte as cutoff_date,
    pg_catalog.jsonb_build_object(
      'provider', cut.fuente,
      'fileName', cut.archivo_nombre,
      'sha256', cut.archivo_sha256
    ) as source,
    'AVAILABLE'::text as status,
    pg_catalog.jsonb_build_object(
      'men', nominal_row.padron_hombres,
      'women', nominal_row.padron_mujeres,
      'nonBinary', nominal_row.padron_no_binario,
      'total', nominal_row.padron_total
    ) as padron,
    pg_catalog.jsonb_build_object(
      'men', nominal_row.lista_hombres,
      'women', nominal_row.lista_mujeres,
      'nonBinary', nominal_row.lista_no_binario,
      'total', nominal_row.lista_total
    ) as nominal,
    nominal_row.diferencia as difference,
    nominal_row.cobertura as coverage
  from selected_cut cut
  join public.lista_nominal_correspondencias correspondence
    on correspondence.lista_nominal_corte_id = cut.lista_nominal_corte_id
   and correspondence.cartografia_version_id = p_cartografia_version_id
   and correspondence.seccion_id = p_seccion_id
   and correspondence.estado = 'VINCULADA'
  join public.lista_nominal_secciones nominal_row
    on nominal_row.lista_nominal_corte_id = correspondence.lista_nominal_corte_id
   and nominal_row.lista_nominal_seccion_id = correspondence.lista_nominal_seccion_id
  limit 1;
$$;

create function public.rpc_lista_nominal_cobertura(
  p_lista_nominal_corte_id bigint,
  p_cartografia_version_id bigint
)
returns table (
  cut_id bigint,
  version_id bigint,
  cutoff_date date,
  cut_status text,
  source_rows integer,
  linked_rows integer,
  pending_rows integer,
  ambiguous_rows integer,
  excluded_rows integer,
  cartography_rows integer,
  cartography_without_nominal integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    cut.lista_nominal_corte_id as cut_id,
    p_cartografia_version_id as version_id,
    cut.fecha_corte as cutoff_date,
    cut.estado as cut_status,
    (
      select pg_catalog.count(*)::integer
      from public.lista_nominal_secciones nominal_row
      where nominal_row.lista_nominal_corte_id = cut.lista_nominal_corte_id
    ) as source_rows,
    (
      select pg_catalog.count(*) filter (where correspondence.estado = 'VINCULADA')::integer
      from public.lista_nominal_correspondencias correspondence
      where correspondence.lista_nominal_corte_id = cut.lista_nominal_corte_id
        and correspondence.cartografia_version_id = p_cartografia_version_id
    ) as linked_rows,
    (
      select pg_catalog.count(*) filter (where correspondence.estado = 'PENDIENTE')::integer
      from public.lista_nominal_correspondencias correspondence
      where correspondence.lista_nominal_corte_id = cut.lista_nominal_corte_id
        and correspondence.cartografia_version_id = p_cartografia_version_id
    ) as pending_rows,
    (
      select pg_catalog.count(*) filter (where correspondence.estado = 'AMBIGUA')::integer
      from public.lista_nominal_correspondencias correspondence
      where correspondence.lista_nominal_corte_id = cut.lista_nominal_corte_id
        and correspondence.cartografia_version_id = p_cartografia_version_id
    ) as ambiguous_rows,
    (
      select pg_catalog.count(*) filter (where correspondence.estado = 'EXCLUIDA')::integer
      from public.lista_nominal_correspondencias correspondence
      where correspondence.lista_nominal_corte_id = cut.lista_nominal_corte_id
        and correspondence.cartografia_version_id = p_cartografia_version_id
    ) as excluded_rows,
    (
      select pg_catalog.count(*)::integer
      from public.cartografia_secciones cartography
      where cartography.cartografia_version_id = p_cartografia_version_id
    ) as cartography_rows,
    (
      select pg_catalog.count(*)::integer
      from public.cartografia_secciones cartography
      where cartography.cartografia_version_id = p_cartografia_version_id
        and not exists (
          select 1
          from public.lista_nominal_correspondencias correspondence
          where correspondence.lista_nominal_corte_id = cut.lista_nominal_corte_id
            and correspondence.cartografia_version_id = p_cartografia_version_id
            and correspondence.cartografia_seccion_id = cartography.cartografia_seccion_id
            and correspondence.estado = 'VINCULADA'
        )
    ) as cartography_without_nominal
  from public.lista_nominal_cortes cut
  where cut.lista_nominal_corte_id = p_lista_nominal_corte_id
    and cut.estado in ('PUBLICADO', 'ARCHIVADO');
$$;

revoke all on function public.rpc_lista_nominal_seccion(bigint, bigint, date)
  from public, anon, authenticated, service_role;
revoke all on function public.rpc_lista_nominal_cobertura(bigint, bigint)
  from public, anon, authenticated, service_role;

grant execute on function public.rpc_lista_nominal_seccion(bigint, bigint, date)
  to service_role;
grant execute on function public.rpc_lista_nominal_cobertura(bigint, bigint)
  to service_role;

commit;
