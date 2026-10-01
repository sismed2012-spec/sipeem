do $correction$
declare
  canonical_rows_before bigint;
  canonical_rows_after bigint;
  orphan_rows_before bigint;
  orphan_rows_after bigint;
  staging_rows bigint;
  updated_rows bigint;
begin
  select count(*)
    into canonical_rows_before
  from public.resultados_municipales_oficiales_fuerzas;

  select count(*)
    into staging_rows
  from public.staging_electoral_resultados;

  select count(*)
    into orphan_rows_before
  from public.resultados_municipales_oficiales_fuerzas force_result
  where force_result.resultado_staging_id is not null
    and not exists (
      select 1
      from public.staging_electoral_resultados staging_result
      where staging_result.resultado_staging_id = force_result.resultado_staging_id
    );

  if staging_rows <> 0 then
    raise exception 'Expected empty staging table, received % rows', staging_rows;
  end if;
  if orphan_rows_before <> 2280 then
    raise exception 'Expected 2280 orphan references, received %', orphan_rows_before;
  end if;

  update public.resultados_municipales_oficiales_fuerzas force_result
  set resultado_staging_id = null
  where force_result.resultado_staging_id is not null
    and not exists (
      select 1
      from public.staging_electoral_resultados staging_result
      where staging_result.resultado_staging_id = force_result.resultado_staging_id
    );
  get diagnostics updated_rows = row_count;

  if updated_rows <> 2280 then
    raise exception 'Expected to change 2280 orphan references, changed %', updated_rows;
  end if;

  select count(*)
    into canonical_rows_after
  from public.resultados_municipales_oficiales_fuerzas;
  select count(*)
    into orphan_rows_after
  from public.resultados_municipales_oficiales_fuerzas force_result
  where force_result.resultado_staging_id is not null
    and not exists (
      select 1
      from public.staging_electoral_resultados staging_result
      where staging_result.resultado_staging_id = force_result.resultado_staging_id
    );

  if canonical_rows_after <> canonical_rows_before then
    raise exception 'Canonical row count changed from % to %', canonical_rows_before, canonical_rows_after;
  end if;
  if orphan_rows_after <> 0 then
    raise exception 'Orphan references remain after correction: %', orphan_rows_after;
  end if;
end
$correction$;
