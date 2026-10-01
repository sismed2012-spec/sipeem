with
primary_keys as (
  select
    con.conrelid,
    jsonb_agg(att.attname order by keys.ordinality) as columns
  from pg_catalog.pg_constraint con
  cross join lateral unnest(con.conkey) with ordinality as keys(attnum, ordinality)
  join pg_catalog.pg_attribute att
    on att.attrelid = con.conrelid
   and att.attnum = keys.attnum
  where con.contype = 'p'
  group by con.conrelid
),
table_inventory as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', pg_catalog.format('%I.%I', n.nspname, c.relname),
        'estimatedRows', greatest(c.reltuples, 0)::bigint,
        'totalBytes', pg_catalog.pg_total_relation_size(c.oid),
        'primaryKey', coalesce(pk.columns, '[]'::jsonb)
      ) order by n.nspname, c.relname
    ),
    '[]'::jsonb
  ) as value
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  left join primary_keys pk on pk.conrelid = c.oid
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
),
foreign_key_inventory as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', con.conname,
        'fromTable', pg_catalog.format('%I.%I', source_ns.nspname, source_table.relname),
        'toTable', pg_catalog.format('%I.%I', target_ns.nspname, target_table.relname),
        'columns', column_pairs.value,
        'deferred', con.condeferrable,
        'initiallyDeferred', con.condeferred
      ) order by source_ns.nspname, source_table.relname, con.conname
    ),
    '[]'::jsonb
  ) as value
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class source_table on source_table.oid = con.conrelid
  join pg_catalog.pg_namespace source_ns on source_ns.oid = source_table.relnamespace
  join pg_catalog.pg_class target_table on target_table.oid = con.confrelid
  join pg_catalog.pg_namespace target_ns on target_ns.oid = target_table.relnamespace
  cross join lateral (
    select jsonb_agg(
      jsonb_build_object('from', source_att.attname, 'to', target_att.attname)
      order by keys.ordinality
    ) as value
    from unnest(con.conkey, con.confkey) with ordinality
      as keys(source_attnum, target_attnum, ordinality)
    join pg_catalog.pg_attribute source_att
      on source_att.attrelid = con.conrelid
     and source_att.attnum = keys.source_attnum
    join pg_catalog.pg_attribute target_att
      on target_att.attrelid = con.confrelid
     and target_att.attnum = keys.target_attnum
  ) column_pairs
  where con.contype = 'f'
    and source_ns.nspname = 'public'
),
sequence_inventory as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', pg_catalog.format('%I.%I', schemaname, sequencename),
        'dataType', data_type,
        'startValue', start_value,
        'incrementBy', increment_by,
        'cycle', cycle
      ) order by schemaname, sequencename
    ),
    '[]'::jsonb
  ) as value
  from pg_catalog.pg_sequences
  where schemaname = 'public'
),
relation_dependencies as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'dependent', pg_catalog.format('%I.%I', sequence_ns.nspname, sequence_rel.relname),
        'referenced', pg_catalog.format('%I.%I', table_ns.nspname, table_rel.relname),
        'type', 'sequence_ownership'
      ) order by sequence_ns.nspname, sequence_rel.relname
    ),
    '[]'::jsonb
  ) as value
  from pg_catalog.pg_depend dependency
  join pg_catalog.pg_class sequence_rel
    on sequence_rel.oid = dependency.objid
   and sequence_rel.relkind = 'S'
  join pg_catalog.pg_namespace sequence_ns on sequence_ns.oid = sequence_rel.relnamespace
  join pg_catalog.pg_class table_rel on table_rel.oid = dependency.refobjid
  join pg_catalog.pg_namespace table_ns on table_ns.oid = table_rel.relnamespace
  where sequence_ns.nspname = 'public'
    and table_ns.nspname = 'public'
    and dependency.deptype in ('a', 'i')
)
select jsonb_build_object(
  'contractVersion', 1,
  'kind', 'promotion_data_inventory',
  'tables', table_inventory.value,
  'foreignKeys', foreign_key_inventory.value,
  'sequences', sequence_inventory.value,
  'dependencies', relation_dependencies.value
)
from table_inventory, foreign_key_inventory, sequence_inventory, relation_dependencies;
