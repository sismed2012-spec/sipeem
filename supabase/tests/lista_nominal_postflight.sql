do $postflight$
declare
  v_corte_id bigint;
  v_estado text;
  v_source_rows integer;
  v_linked integer;
  v_pending integer;
  v_ambiguous integer;
  v_excluded integer;
  v_cartography_without_nominal integer;
  v_padron bigint;
  v_nominal bigint;
  v_difference bigint;
  v_forbidden_links integer;
begin
  select lista_nominal_corte_id, estado
  into strict v_corte_id, v_estado
  from public.lista_nominal_cortes
  where archivo_sha256 = 'd016713ed9304ae696fbcf875141cf8268799d05468f1afb79bb8785227de161';

  if v_estado not in ('VALIDADO', 'PUBLICADO') then
    raise exception 'Nominal cut state is %; expected VALIDADO or PUBLICADO', v_estado;
  end if;

  select
    pg_catalog.count(*)::integer,
    pg_catalog.sum(padron_total),
    pg_catalog.sum(lista_total),
    pg_catalog.sum(diferencia)
  into v_source_rows, v_padron, v_nominal, v_difference
  from public.lista_nominal_secciones
  where lista_nominal_corte_id = v_corte_id;

  if (v_source_rows, v_padron, v_nominal, v_difference)
     is distinct from (7191, 13407250::bigint, 13206301::bigint, 200949::bigint) then
    raise exception 'Source profile mismatch: rows %, padron %, nominal %, difference %',
      v_source_rows, v_padron, v_nominal, v_difference;
  end if;

  select
    pg_catalog.count(*) filter (where estado = 'VINCULADA')::integer,
    pg_catalog.count(*) filter (where estado = 'PENDIENTE')::integer,
    pg_catalog.count(*) filter (where estado = 'AMBIGUA')::integer,
    pg_catalog.count(*) filter (where estado = 'EXCLUIDA')::integer
  into v_linked, v_pending, v_ambiguous, v_excluded
  from public.lista_nominal_correspondencias
  where lista_nominal_corte_id = v_corte_id
    and cartografia_version_id = 4025;

  if (v_linked, v_pending, v_ambiguous, v_excluded)
     is distinct from (7001, 190, 0, 0) then
    raise exception 'Crosswalk mismatch: linked %, pending %, ambiguous %, excluded %',
      v_linked, v_pending, v_ambiguous, v_excluded;
  end if;

  select pg_catalog.count(*)::integer
  into v_cartography_without_nominal
  from public.cartografia_secciones cs
  join public.cartografia_municipios cm
    on cm.cartografia_municipio_id = cs.cartografia_municipio_id
   and cm.cartografia_version_id = cs.cartografia_version_id
   and cm.municipio_id = cs.municipio_id
  where cs.cartografia_version_id = 4025
    and not exists (
      select 1
      from public.lista_nominal_secciones n
      where n.lista_nominal_corte_id = v_corte_id
        and n.clave_entidad = cs.clave_entidad
        and n.clave_municipio = cm.clave_municipio
        and n.numero_seccion = cs.numero
    );
  if v_cartography_without_nominal <> 51 then
    raise exception 'Cartography sections without exact nominal data: %; expected 51',
      v_cartography_without_nominal;
  end if;

  select pg_catalog.count(*)::integer
  into v_forbidden_links
  from public.lista_nominal_correspondencias c
  join public.lista_nominal_secciones n
    on n.lista_nominal_seccion_id = c.lista_nominal_seccion_id
   and n.lista_nominal_corte_id = c.lista_nominal_corte_id
  where c.lista_nominal_corte_id = v_corte_id
    and c.cartografia_version_id = 4025
    and c.estado = 'VINCULADA'
    and n.numero_seccion in (696, 6593);
  if v_forbidden_links <> 0 then
    raise exception 'Sections 696 or 6593 were incorrectly linked across municipalities';
  end if;
end
$postflight$;

select pg_catalog.jsonb_build_object(
  'sourceRows', pg_catalog.count(*),
  'linked', pg_catalog.count(*) filter (where c.estado = 'VINCULADA'),
  'pending', pg_catalog.count(*) filter (where c.estado = 'PENDIENTE'),
  'ambiguous', pg_catalog.count(*) filter (where c.estado = 'AMBIGUA'),
  'padron', pg_catalog.sum(n.padron_total),
  'nominal', pg_catalog.sum(n.lista_total),
  'difference', pg_catalog.sum(n.diferencia)
) as postflight
from public.lista_nominal_cortes cut
join public.lista_nominal_secciones n
  on n.lista_nominal_corte_id = cut.lista_nominal_corte_id
join public.lista_nominal_correspondencias c
  on c.lista_nominal_corte_id = cut.lista_nominal_corte_id
 and c.lista_nominal_seccion_id = n.lista_nominal_seccion_id
 and c.cartografia_version_id = 4025
where cut.archivo_sha256 = 'd016713ed9304ae696fbcf875141cf8268799d05468f1afb79bb8785227de161';
