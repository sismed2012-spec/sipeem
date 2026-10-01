with
index_catalog as (
  select
    n.nspname as schema_name,
    c.relname as index_name,
    pg_catalog.pg_get_indexdef(c.oid) as definition
  from pg_catalog.pg_index i
  join pg_catalog.pg_class c on c.oid = i.indexrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname not in ('pg_catalog', 'information_schema')
),
ltree_indexes as (
  select coalesce(
    jsonb_agg(jsonb_build_object('schema', schema_name, 'index', index_name, 'definition', definition) order by schema_name, index_name),
    '[]'::jsonb
  ) as value
  from index_catalog
  where lower(definition) like '%ltree%'
),
btree_gist_float_indexes as (
  select coalesce(
    jsonb_agg(jsonb_build_object('schema', schema_name, 'index', index_name, 'definition', definition) order by schema_name, index_name),
    '[]'::jsonb
  ) as value
  from index_catalog
  where lower(definition) like '% using gist %'
    and lower(definition) similar to '%(float4|float8|real|double precision)%'
    and exists (select 1 from pg_catalog.pg_extension where extname = 'btree_gist')
),
legacy_cipher_references as (
  select coalesce(
    jsonb_agg(jsonb_build_object('schema', n.nspname, 'routine', p.proname) order by n.nspname, p.proname),
    '[]'::jsonb
  ) as value
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname not in ('pg_catalog', 'information_schema')
    and p.prosrc ~* '\m(encrypt|decrypt|encrypt_iv|decrypt_iv)\M'
),
custom_estimator_operators as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'schema', n.nspname,
        'operator', o.oprname,
        'restrictionEstimator', o.oprrest::regproc::text,
        'joinEstimator', o.oprjoin::regproc::text
      ) order by n.nspname, o.oprname
    ),
    '[]'::jsonb
  ) as value
  from pg_catalog.pg_operator o
  join pg_catalog.pg_namespace n on n.oid = o.oprnamespace
  where n.nspname not in ('pg_catalog', 'information_schema')
    and (o.oprrest <> 0 or o.oprjoin <> 0)
),
signals as (
  select
    ltree_indexes.value as ltree_value,
    btree_gist_float_indexes.value as btree_gist_value,
    legacy_cipher_references.value as legacy_cipher_value,
    custom_estimator_operators.value as custom_estimator_value
  from ltree_indexes, btree_gist_float_indexes, legacy_cipher_references, custom_estimator_operators
)
select jsonb_build_object(
  'contractVersion', 1,
  'kind', 'promotion_pg17_compatibility',
  'ltreeIndexes', ltree_value,
  'btreeGistFloatIndexes', btree_gist_value,
  'legacyCipherReferences', legacy_cipher_value,
  'customEstimatorOperators', custom_estimator_value,
  'blockingIssues',
    (case when jsonb_array_length(ltree_value) > 0 then jsonb_build_array('ltree_indexes') else '[]'::jsonb end) ||
    (case when jsonb_array_length(btree_gist_value) > 0 then jsonb_build_array('btree_gist_float_nan') else '[]'::jsonb end) ||
    (case when jsonb_array_length(legacy_cipher_value) > 0 then jsonb_build_array('legacy_cipher') else '[]'::jsonb end) ||
    (case when jsonb_array_length(custom_estimator_value) > 0 then jsonb_build_array('custom_estimator') else '[]'::jsonb end)
)
from signals;
