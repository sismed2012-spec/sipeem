with
canonical_tables(table_name) as (
  values
    ('public.cargas_cartograficas'),
    ('public.cargas_cartograficas_lotes'),
    ('public.cargas_electorales'),
    ('public.cartografia_archivos'),
    ('public.cartografia_cobertura_colonias_recibos'),
    ('public.cartografia_cobertura_limites_localidad_recibos'),
    ('public.cartografia_codificaciones_recibos'),
    ('public.cartografia_colonias'),
    ('public.cartografia_colonias_sin_geometria'),
    ('public.cartografia_distritos_federales'),
    ('public.cartografia_distritos_locales'),
    ('public.cartografia_entidades'),
    ('public.cartografia_incidencias'),
    ('public.cartografia_limites_localidad'),
    ('public.cartografia_limites_localidad_puntos'),
    ('public.cartografia_localidades'),
    ('public.cartografia_municipios'),
    ('public.cartografia_secciones'),
    ('public.cartografia_secciones_equivalencias'),
    ('public.cartografia_versiones'),
    ('public.cartografia_versiones_bitacora'),
    ('public.demografia_cargas_lotes'),
    ('public.demografia_eceg_correspondencias'),
    ('public.demografia_eceg_secciones'),
    ('public.demografia_fuentes'),
    ('public.demografia_indicadores'),
    ('public.demografia_localidad_correspondencia_secciones'),
    ('public.demografia_localidad_correspondencias'),
    ('public.demografia_localidades'),
    ('public.demografia_secciones'),
    ('public.demografia_secciones_cobertura'),
    ('public.elecciones'),
    ('public.evento_actores'),
    ('public.evento_evidencias'),
    ('public.evento_georreferenciacion'),
    ('public.evento_historial'),
    ('public.eventos_territoriales'),
    ('public.fuerzas_electorales'),
    ('public.fuerzas_electorales_aliases'),
    ('public.fuerzas_electorales_integrantes'),
    ('public.lista_nominal_correspondencias'),
    ('public.lista_nominal_cortes'),
    ('public.lista_nominal_secciones'),
    ('public.listas_nominales'),
    ('public.participacion_electoral'),
    ('public.partidos_catalogo'),
    ('public.resultados_electorales'),
    ('public.resultados_municipales_oficiales'),
    ('public.resultados_municipales_oficiales_fuerzas'),
    ('public.territorios_colonias'),
    ('public.territorios_distritos_federales'),
    ('public.territorios_distritos_locales'),
    ('public.territorios_localidades'),
    ('public.territorios_municipios'),
    ('public.territorios_secciones'),
    ('public.validaciones_cartograficas_progreso'),
    ('public.validaciones_electorales_progreso')
),
table_counts as (
  select
    table_name,
    ((xpath(
      '//count/text()',
      pg_catalog.query_to_xml(
        pg_catalog.format(
          'select count(*) as count from %I.%I',
          pg_catalog.split_part(table_name, '.', 1),
          pg_catalog.split_part(table_name, '.', 2)
        ),
        false,
        false,
        ''
      )
    ))[1]::text)::bigint as row_count
  from canonical_tables
)
select jsonb_build_object(
  'contractVersion', 1,
  'kind', 'promotion_recovery_absence',
  'tables', jsonb_agg(jsonb_build_object(
    'table', table_name,
    'rowCount', row_count
  ) order by table_name)
)
from table_counts;
