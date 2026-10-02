begin;

alter function public.rpc_indicadores_territoriales(
  text, bigint, bigint, bigint
) set enable_nestloop = off;

alter function public.rpc_indicadores_territoriales(
  text, bigint, bigint, bigint
) set work_mem = '32MB';

commit;
