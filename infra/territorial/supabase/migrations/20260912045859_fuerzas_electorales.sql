create table public.cat_tipos_fuerza_electoral (
  tipo_fuerza_id smallint generated always as identity primary key,
  codigo text not null unique,
  nombre text not null,
  activo boolean not null default true,
  constraint cat_tipos_fuerza_electoral_codigo_formato_ck
    check (codigo = upper(codigo) and codigo ~ '^[A-Z_]+$'),
  constraint cat_tipos_fuerza_electoral_nombre_ck
    check (length(btrim(nombre)) > 0)
);

insert into public.cat_tipos_fuerza_electoral (codigo, nombre)
values
  ('PARTIDO', 'Partido político'),
  ('COALICION', 'Coalición'),
  ('CANDIDATURA_COMUN', 'Candidatura común'),
  ('INDEPENDIENTE', 'Candidatura independiente'),
  ('OTRO', 'Otra fuerza electoral');

create table public.fuerzas_electorales (
  fuerza_id bigint generated always as identity primary key,
  eleccion_id bigint not null references public.elecciones(eleccion_id),
  tipo_fuerza_id smallint not null
    references public.cat_tipos_fuerza_electoral(tipo_fuerza_id),
  codigo text not null,
  nombre text not null,
  partido_id bigint references public.partidos_catalogo(partido_id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fuerzas_electorales_codigo_formato_ck
    check (codigo = upper(codigo) and codigo ~ '^[A-Z0-9_]+$'),
  constraint fuerzas_electorales_nombre_ck
    check (length(btrim(nombre)) > 0),
  constraint fuerzas_electorales_metadata_objeto_ck
    check (jsonb_typeof(metadata) = 'object'),
  constraint fuerzas_electorales_eleccion_codigo_uq
    unique (eleccion_id, codigo),
  constraint fuerzas_electorales_fuerza_eleccion_uq
    unique (fuerza_id, eleccion_id)
);

create table public.fuerzas_electorales_integrantes (
  fuerza_id bigint not null
    references public.fuerzas_electorales(fuerza_id) on delete cascade,
  partido_id bigint not null references public.partidos_catalogo(partido_id),
  orden smallint not null,
  metadata jsonb not null default '{}'::jsonb,
  constraint fuerzas_electorales_integrantes_orden_ck check (orden > 0),
  constraint fuerzas_electorales_integrantes_metadata_objeto_ck
    check (jsonb_typeof(metadata) = 'object'),
  constraint fuerzas_electorales_integrantes_pk primary key (fuerza_id, partido_id),
  constraint fuerzas_electorales_integrantes_orden_uq unique (fuerza_id, orden)
);

create table public.fuerzas_electorales_aliases (
  alias_id bigint generated always as identity primary key,
  fuerza_id bigint not null,
  eleccion_id bigint not null,
  municipio_id bigint references public.territorios_municipios(municipio_id),
  tabla_origen text not null,
  campo_origen text not null,
  alias_original text not null,
  alias_normalizado text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint fuerzas_electorales_aliases_fuerza_eleccion_fk
    foreign key (fuerza_id, eleccion_id)
    references public.fuerzas_electorales(fuerza_id, eleccion_id)
    on delete cascade,
  constraint fuerzas_electorales_aliases_tabla_formato_ck
    check (tabla_origen ~ '^[a-z][a-z0-9_]*$'),
  constraint fuerzas_electorales_aliases_campo_formato_ck
    check (campo_origen ~ '^[a-z][a-z0-9_]*$'),
  constraint fuerzas_electorales_aliases_original_ck
    check (length(btrim(alias_original)) > 0),
  constraint fuerzas_electorales_aliases_normalizado_formato_ck
    check (
      alias_normalizado = upper(alias_normalizado)
      and alias_normalizado ~ '^[A-Z0-9_]+$'
    ),
  constraint fuerzas_electorales_aliases_metadata_objeto_ck
    check (jsonb_typeof(metadata) = 'object')
);

create trigger fuerzas_electorales_set_updated_at
  before update on public.fuerzas_electorales
  for each row execute function territorial_private.set_updated_at();

create index fuerzas_electorales_tipo_idx
  on public.fuerzas_electorales (tipo_fuerza_id, eleccion_id);
create index fuerzas_electorales_partido_idx
  on public.fuerzas_electorales (partido_id, eleccion_id)
  where partido_id is not null;
create index fuerzas_electorales_integrantes_partido_idx
  on public.fuerzas_electorales_integrantes (partido_id, fuerza_id);
create index fuerzas_electorales_aliases_fuerza_idx
  on public.fuerzas_electorales_aliases (fuerza_id, eleccion_id);
create index fuerzas_electorales_aliases_municipio_idx
  on public.fuerzas_electorales_aliases (municipio_id)
  where municipio_id is not null;
create unique index fuerzas_electorales_aliases_contexto_uq
  on public.fuerzas_electorales_aliases (
    eleccion_id,
    tabla_origen,
    campo_origen,
    municipio_id,
    alias_normalizado
  ) nulls not distinct;

alter table public.resultados_electorales
  add column fuerza_id bigint;

insert into public.fuerzas_electorales (
  eleccion_id,
  tipo_fuerza_id,
  codigo,
  nombre,
  partido_id,
  metadata
)
select distinct
  resultado.eleccion_id,
  tipo.tipo_fuerza_id,
  partido.siglas,
  partido.nombre,
  partido.partido_id,
  jsonb_build_object('origen', 'migracion_resultados_electorales')
from public.resultados_electorales resultado
join public.partidos_catalogo partido
  on partido.partido_id = resultado.partido_id
join public.cat_tipos_fuerza_electoral tipo
  on tipo.codigo = 'PARTIDO'
on conflict (eleccion_id, codigo) do nothing;

update public.resultados_electorales resultado
set fuerza_id = fuerza.fuerza_id
from public.fuerzas_electorales fuerza
where fuerza.eleccion_id = resultado.eleccion_id
  and fuerza.partido_id = resultado.partido_id;

alter table public.resultados_electorales
  alter column fuerza_id set not null;

alter table public.resultados_electorales
  add constraint resultados_electorales_fuerza_eleccion_fk
  foreign key (fuerza_id, eleccion_id)
  references public.fuerzas_electorales(fuerza_id, eleccion_id);

alter table public.resultados_electorales
  drop constraint resultados_electorales_eleccion_seccion_partido_uq;

drop index public.resultados_electorales_partido_idx;

alter table public.resultados_electorales
  drop column partido_id;

alter table public.resultados_electorales
  add constraint resultados_electorales_eleccion_seccion_fuerza_uq
  unique (eleccion_id, seccion_id, fuerza_id);

create index resultados_electorales_fuerza_idx
  on public.resultados_electorales (fuerza_id, eleccion_id);

alter table public.cat_tipos_fuerza_electoral enable row level security;
alter table public.fuerzas_electorales enable row level security;
alter table public.fuerzas_electorales_integrantes enable row level security;
alter table public.fuerzas_electorales_aliases enable row level security;

revoke all on table
  public.cat_tipos_fuerza_electoral,
  public.fuerzas_electorales,
  public.fuerzas_electorales_integrantes,
  public.fuerzas_electorales_aliases
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.cat_tipos_fuerza_electoral,
  public.fuerzas_electorales,
  public.fuerzas_electorales_integrantes,
  public.fuerzas_electorales_aliases
to service_role;

revoke all on sequence
  public.cat_tipos_fuerza_electoral_tipo_fuerza_id_seq,
  public.fuerzas_electorales_fuerza_id_seq,
  public.fuerzas_electorales_aliases_alias_id_seq
from public, anon, authenticated;

grant usage, select on sequence
  public.cat_tipos_fuerza_electoral_tipo_fuerza_id_seq,
  public.fuerzas_electorales_fuerza_id_seq,
  public.fuerzas_electorales_aliases_alias_id_seq
to service_role;

create or replace function public.rpc_get_seccion_contexto(p_seccion_id bigint)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_contexto jsonb;
begin
  if p_seccion_id is null then
    raise exception 'seccion_id es obligatorio' using errcode = '22004';
  end if;

  select jsonb_build_object(
    'territorio', jsonb_build_object(
      'seccion', jsonb_build_object(
        'seccion_id', s.seccion_id,
        'clave_entidad', s.clave_entidad,
        'numero', s.numero
      ),
      'municipio', jsonb_build_object(
        'municipio_id', m.municipio_id,
        'clave', m.clave_municipio,
        'nombre', m.nombre
      ),
      'distrito_local', case when dl.distrito_local_id is null then null else jsonb_build_object(
        'distrito_local_id', dl.distrito_local_id,
        'numero', dl.numero,
        'nombre', dl.nombre
      ) end,
      'distrito_federal', case when df.distrito_federal_id is null then null else jsonb_build_object(
        'distrito_federal_id', df.distrito_federal_id,
        'numero', df.numero,
        'nombre', df.nombre
      ) end
    ),
    'electoral', coalesce(electoral.resumen, '{}'::jsonb),
    'eventos', jsonb_build_object(
      'total_30_dias', coalesce(eventos_30_dias.total, 0),
      'requieren_atencion_30_dias', coalesce(eventos_30_dias.requieren_atencion, 0),
      'ultimo_evento_en', ultimo_evento.ocurrido_en
    )
  )
  into v_contexto
  from public.territorios_secciones s
  join public.territorios_municipios m on m.municipio_id = s.municipio_id
  left join public.territorios_distritos_locales dl
    on dl.distrito_local_id = s.distrito_local_id
  left join public.territorios_distritos_federales df
    on df.distrito_federal_id = s.distrito_federal_id
  left join lateral (
    select
      count(*) as total,
      count(*) filter (where e.requiere_atencion) as requieren_atencion
    from public.eventos_territoriales e
    where e.seccion_id = s.seccion_id
      and e.ocurrido_en >= now() - interval '30 days'
  ) eventos_30_dias on true
  left join lateral (
    select e.ocurrido_en
    from public.eventos_territoriales e
    where e.seccion_id = s.seccion_id
    order by e.ocurrido_en desc, e.evento_id desc
    limit 1
  ) ultimo_evento on true
  left join lateral (
    select jsonb_build_object(
      'eleccion', jsonb_build_object(
        'eleccion_id', el.eleccion_id,
        'clave', el.clave,
        'nombre', el.nombre,
        'fecha', el.fecha_eleccion
      ),
      'lista_nominal', ln.total,
      'participacion', case when pe.participacion_id is null then null else jsonb_build_object(
        'votos_emitidos', pe.votos_emitidos,
        'votos_validos', pe.votos_validos,
        'votos_nulos', pe.votos_nulos,
        'votos_no_registrados', pe.votos_no_registrados
      ) end,
      'resultados', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'fuerza_id', fuerza.fuerza_id,
            'partido_id', fuerza.partido_id,
            'siglas', fuerza.codigo,
            'codigo', fuerza.codigo,
            'nombre', fuerza.nombre,
            'tipo', tipo.codigo,
            'votos', resultado.votos,
            'es_ganador', null,
            'es_mayor_votacion_individual', resultado.posicion = 1
          ) order by resultado.votos desc, fuerza.codigo
        )
        from (
          select
            re.fuerza_id,
            re.votos,
            dense_rank() over (order by re.votos desc) as posicion
          from public.resultados_electorales re
          where re.eleccion_id = el.eleccion_id
            and re.seccion_id = ln.seccion_id
        ) resultado
        join public.fuerzas_electorales fuerza
          on fuerza.fuerza_id = resultado.fuerza_id
        join public.cat_tipos_fuerza_electoral tipo
          on tipo.tipo_fuerza_id = fuerza.tipo_fuerza_id
      ), '[]'::jsonb)
    ) as resumen
    from public.listas_nominales ln
    join public.elecciones el on el.eleccion_id = ln.eleccion_id
    left join public.participacion_electoral pe
      on pe.eleccion_id = ln.eleccion_id
      and pe.seccion_id = ln.seccion_id
    where ln.seccion_id = s.seccion_id
    order by el.fecha_eleccion desc, el.eleccion_id desc
    limit 1
  ) electoral on true
  where s.seccion_id = p_seccion_id;

  if v_contexto is null then
    raise exception 'No existe la sección %', p_seccion_id using errcode = 'P0002';
  end if;

  return v_contexto;
end;
$$;

revoke all on function public.rpc_get_seccion_contexto(bigint)
  from public, anon, authenticated;
grant execute on function public.rpc_get_seccion_contexto(bigint) to service_role;

comment on table public.cat_tipos_fuerza_electoral is
  'Clasifica partidos, coaliciones, candidaturas comunes, independientes y otras fuerzas.';
comment on table public.fuerzas_electorales is
  'Identidad de una fuerza electoral dentro de una elección específica.';
comment on table public.fuerzas_electorales_integrantes is
  'Partidos atómicos que integran una fuerza electoral compuesta.';
comment on table public.fuerzas_electorales_aliases is
  'Equivalencias explícitas y contextuales entre etiquetas de origen y fuerzas electorales.';
comment on function public.rpc_get_seccion_contexto(bigint) is
  'Devuelve contexto territorial, electoral por fuerza y de eventos; no infiere la candidatura ganadora desde líneas seccionales.';

;
