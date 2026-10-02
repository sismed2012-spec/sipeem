with correction_state as (
  select
    (select count(*) from public.resultados_municipales_oficiales_fuerzas) as canonical_rows,
    count(*) filter (where force_result.resultado_staging_id is not null) as non_null_references,
    count(*) filter (
      where force_result.resultado_staging_id is not null
        and staging_result.resultado_staging_id is null
    ) as orphan_references,
    (select count(*) from public.staging_electoral_resultados) as staging_rows
  from public.resultados_municipales_oficiales_fuerzas force_result
  left join public.staging_electoral_resultados staging_result
    on staging_result.resultado_staging_id = force_result.resultado_staging_id
)
select jsonb_build_object(
  'contractVersion', 1,
  'kind', 'resultado_staging_orphan_correction',
  'phase', 'preflight',
  'canonicalRows', canonical_rows,
  'nonNullReferences', non_null_references,
  'orphanReferences', orphan_references,
  'stagingRows', staging_rows
)
from correction_state;
