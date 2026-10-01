do $preflight$
declare
  v_relation text;
begin
  foreach v_relation in array array[
    'lista_nominal_cortes',
    'lista_nominal_secciones',
    'lista_nominal_correspondencias'
  ] loop
    if pg_catalog.to_regclass('public.' || v_relation) is not null then
      raise exception 'preflight refused: public.% already exists', v_relation;
    end if;
  end loop;

  if pg_catalog.to_regprocedure('territorial_private.lista_nominal_guardar_estado_corte()') is not null
     or pg_catalog.to_regprocedure('territorial_private.lista_nominal_guardar_filas_publicadas()') is not null then
    raise exception 'preflight refused: nominal-list guard function already exists';
  end if;
end
$preflight$;
