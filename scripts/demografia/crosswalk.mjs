import { hashRecord } from "./iter-parser.mjs";

const DEFAULTS = Object.freeze({
  ambiguityDelta: 0.03,
  maxDistanceMeters: 5000,
  minimumNameScore: 0.72,
});

export function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function bigrams(value) {
  const padded = ` ${value} `;
  const result = [];
  for (let index = 0; index < padded.length - 1; index += 1) {
    result.push(padded.slice(index, index + 2));
  }
  return result;
}

export function scoreNames(left, right) {
  const a = normalizeName(left);
  const b = normalizeName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const remaining = new Map();
  for (const gram of bigrams(a)) remaining.set(gram, (remaining.get(gram) ?? 0) + 1);
  let overlap = 0;
  const rightBigrams = bigrams(b);
  for (const gram of rightBigrams) {
    const available = remaining.get(gram) ?? 0;
    if (available > 0) {
      overlap += 1;
      remaining.set(gram, available - 1);
    }
  }
  return (2 * overlap) / (bigrams(a).length + rightBigrams.length);
}

export function rankCandidates(source, candidates, options = {}) {
  const config = { ...DEFAULTS, ...options };
  return candidates
    .filter((candidate) => (
      candidate.cartographyVersionId === source.cartographyVersionId
      && candidate.municipalityContains === true
    ))
    .map((candidate) => {
      const nameScore = scoreNames(source.name, candidate.name);
      const distanceMeters = Number(candidate.distanceMeters ?? Number.POSITIVE_INFINITY);
      const distanceScore = Number.isFinite(distanceMeters)
        ? Math.max(0, 1 - (distanceMeters / config.maxDistanceMeters))
        : 0;
      const compositeScore = (nameScore * 0.8) + (distanceScore * 0.2);
      return {
        ...candidate,
        nameScore,
        distanceMeters,
        compositeScore,
      };
    })
    .sort((left, right) => (
      right.compositeScore - left.compositeScore
      || left.distanceMeters - right.distanceMeters
      || left.candidateId - right.candidateId
    ));
}

function emptyResult(source, ranked) {
  return {
    status: "SIN_CORRESPONDENCIA",
    method: "SIN_MATCH",
    selectedBoundaryId: null,
    selectedCartographySectionId: null,
    selectedSectionId: null,
    confidence: 0,
    evidence: {
      cartographyVersionId: source.cartographyVersionId,
      sourcePoint: [source.longitude, source.latitude],
      candidateIds: ranked.map(({ candidateId }) => candidateId),
      ambiguous: false,
      intersectionCount: 0,
      candidates: ranked.map(candidateEvidence),
    },
  };
}

function candidateEvidence(candidate) {
  return {
    candidateId: candidate.candidateId,
    boundaryId: candidate.boundaryId,
    distanceMeters: candidate.distanceMeters,
    nameScore: candidate.nameScore,
    compositeScore: candidate.compositeScore,
    sourceCode: candidate.sourceCode ?? null,
    candidateCode: candidate.candidateCode ?? null,
    sectionCandidateIds: (candidate.sectionCandidates ?? [])
      .map(({ cartographySectionId }) => cartographySectionId),
  };
}

export function classifyCrosswalk(source, candidates, options = {}) {
  const config = { ...DEFAULTS, ...options };
  const ranked = rankCandidates(source, candidates, config);
  const eligible = ranked.filter((candidate) => (
    candidate.boundaryId != null && candidate.nameScore >= config.minimumNameScore
  ));
  if (eligible.length === 0) return emptyResult(source, ranked);

  const best = eligible[0];
  const runnerUp = eligible[1];
  const ambiguous = runnerUp != null
    && (best.compositeScore - runnerUp.compositeScore) <= config.ambiguityDelta;
  const sections = [...new Map(
    (best.sectionCandidates ?? []).map((section) => [section.cartographySectionId, section])
  ).values()];
  const evidence = {
    cartographyVersionId: source.cartographyVersionId,
    sourcePoint: [source.longitude, source.latitude],
    pointSectionId: best.pointSectionId ?? null,
    candidateIds: eligible.map(({ candidateId }) => candidateId),
    ambiguous,
    distanceMeters: best.distanceMeters,
    nameScore: best.nameScore,
    intersectionCount: sections.length,
    candidates: eligible.map(candidateEvidence),
  };

  if (ambiguous) {
    return {
      status: "REVISION_MANUAL",
      method: "NOMBRE_COORDENADA",
      selectedBoundaryId: best.boundaryId,
      selectedCartographySectionId: null,
      selectedSectionId: null,
      confidence: best.compositeScore,
      evidence,
    };
  }
  if (sections.length > 1) {
    return {
      status: "MULTISECCION",
      method: "ESPACIAL",
      selectedBoundaryId: best.boundaryId,
      selectedCartographySectionId: null,
      selectedSectionId: null,
      confidence: best.compositeScore,
      evidence,
    };
  }
  if (sections.length === 1 && sections[0].strictCoverage === true) {
    return {
      status: "DIRECTA",
      method: "NOMBRE_COORDENADA",
      selectedBoundaryId: best.boundaryId,
      selectedCartographySectionId: sections[0].cartographySectionId,
      selectedSectionId: sections[0].sectionId,
      confidence: best.compositeScore,
      evidence,
    };
  }
  return {
    status: sections.length === 0 ? "SIN_CORRESPONDENCIA" : "REVISION_MANUAL",
    method: sections.length === 0 ? "SIN_MATCH" : "ESPACIAL",
    selectedBoundaryId: best.boundaryId,
    selectedCartographySectionId: null,
    selectedSectionId: null,
    confidence: best.compositeScore,
    evidence,
  };
}

function assertConfig({ sourceHash, cartographyVersionId }) {
  if (!/^[0-9a-f]{64}$/.test(sourceHash ?? "")) throw new Error("sourceHash must be SHA-256");
  if (!Number.isSafeInteger(cartographyVersionId) || cartographyVersionId <= 0) {
    throw new Error("cartographyVersionId must be a positive integer");
  }
}

function crosswalkSql(config) {
  const {
    sourceHash,
    cartographyVersionId,
    minimumNameScore,
    ambiguityDelta,
    maxDistanceMeters,
  } = config;
  const normalized = (expression) => `pg_catalog.btrim(pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.translate(${expression}, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')), '[^a-z0-9]+', ' ', 'g'))`;
  return `begin;
set constraints all deferred;
create temporary table demografia_crosswalk_stage on commit drop as
with source_rows as (
  select
    d.demografia_fuente_id,
    d.demografia_localidad_id,
    d.clave_localidad,
    d.nombre_localidad,
    d.longitud,
    d.latitud,
    extensions.st_setsrid(extensions.st_makepoint(d.longitud::double precision, d.latitud::double precision), 4326) as source_point
  from public.demografia_localidades d
  join public.demografia_fuentes f using (demografia_fuente_id)
  where f.archivo_sha256 = '${sourceHash}'
), municipalized as (
  select src.*, m.cartografia_municipio_id, m.municipio_id
  from source_rows src
  left join lateral (
    select m.cartografia_municipio_id, m.municipio_id
    from public.cartografia_municipios m
    where m.cartografia_version_id = ${cartographyVersionId}
      and extensions.st_covers(m.geom, src.source_point)
    order by m.cartografia_municipio_id
    limit 1
  ) m on true
), named_candidates as (
  select
    src.*,
    l.cartografia_limite_localidad_id,
    l.nombre as candidate_name,
    l.clave_localidad_fuente as candidate_code,
    l.geom,
    case
      when ${normalized("src.nombre_localidad")} = ${normalized("l.nombre")} then 1.0
      when ${normalized("l.nombre")} like '%' || ${normalized("src.nombre_localidad")} || '%'
        or ${normalized("src.nombre_localidad")} like '%' || ${normalized("l.nombre")} || '%' then 0.85
      else 0.0
    end::numeric as similitud_nombre
  from municipalized src
  join public.cartografia_limites_localidad l
    on l.cartografia_version_id = ${cartographyVersionId}
   and l.cartografia_municipio_id = src.cartografia_municipio_id
), eligible_name_candidates as (
  select named.*
  from named_candidates named
  where named.similitud_nombre >= ${minimumNameScore}
), locality_candidates as (
  select
    named.*,
    extensions.st_distance(named.source_point::extensions.geography, named.geom::extensions.geography) as distancia_metros
  from eligible_name_candidates named
  where extensions.st_dwithin(named.source_point::extensions.geography, named.geom::extensions.geography, ${maxDistanceMeters})
), ranked as (
  select c.*,
    (c.similitud_nombre * 0.8 + greatest(0::double precision, 1 - c.distancia_metros / ${maxDistanceMeters}) * 0.2) as confianza,
    pg_catalog.row_number() over (
      partition by c.demografia_localidad_id
      order by c.similitud_nombre desc, c.distancia_metros, c.cartografia_limite_localidad_id
    ) as candidate_rank
  from locality_candidates c
), candidate_context as (
  select
    r.demografia_localidad_id,
    pg_catalog.jsonb_agg(r.cartografia_limite_localidad_id order by r.candidate_rank) as candidate_ids,
    pg_catalog.max(r.confianza) filter (where r.candidate_rank = 1) as first_confidence,
    pg_catalog.max(r.confianza) filter (where r.candidate_rank = 2) as second_confidence
  from ranked r
  where r.similitud_nombre >= ${minimumNameScore}
  group by r.demografia_localidad_id
), chosen as (
  select r.*
  from ranked r
  where r.candidate_rank = 1 and r.similitud_nombre >= ${minimumNameScore}
), section_hits as (
  select
    chosen.demografia_localidad_id,
    s.cartografia_seccion_id,
    s.seccion_id,
    case when extensions.st_area(extensions.st_intersection(chosen.geom, s.geom)::extensions.geography) > 0 then 'AREA' else 'BORDE' end as tipo_contacto,
    extensions.st_area(extensions.st_intersection(chosen.geom, s.geom)::extensions.geography) as area_interseccion,
    extensions.st_coveredby(chosen.geom, s.geom) as cobertura_estricta
  from chosen
  join public.cartografia_secciones s
    on s.cartografia_version_id = ${cartographyVersionId}
   and extensions.st_intersects(chosen.geom, s.geom)
), section_summary as (
  select
    h.demografia_localidad_id,
    pg_catalog.count(*)::integer as secciones_candidatas,
    pg_catalog.bool_and(h.cobertura_estricta) and pg_catalog.count(*) = 1 as cobertura_estricta,
    pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'cartografia_seccion_id', h.cartografia_seccion_id,
      'seccion_id', h.seccion_id,
      'tipo_contacto', h.tipo_contacto,
      'area_interseccion', h.area_interseccion,
      'proporcion_localidad', case when h.cobertura_estricta then 1 else 0 end
    ) order by h.cartografia_seccion_id) as section_candidates
  from section_hits h
  group by h.demografia_localidad_id
)
select
  src.demografia_fuente_id,
  src.demografia_localidad_id,
  ${cartographyVersionId}::bigint as cartografia_version_id,
  chosen.cartografia_limite_localidad_id,
  case when chosen.cartografia_limite_localidad_id is null then 'SIN_MATCH' else 'NOMBRE_COORDENADA' end as metodo,
  territorial_private.demografia_clasificar_correspondencia(
    coalesce(ss.secciones_candidatas, 0), coalesce(ss.cobertura_estricta, false),
    coalesce(cc.first_confidence - cc.second_confidence <= ${ambiguityDelta}, false),
    chosen.cartografia_limite_localidad_id is not null
  ) as estado,
  coalesce(ss.secciones_candidatas, 0) as secciones_candidatas,
  coalesce(ss.cobertura_estricta, false) as cobertura_estricta,
  chosen.distancia_metros,
  chosen.similitud_nombre,
  coalesce(chosen.confianza, 0)::numeric as confianza,
  case when ss.secciones_candidatas = 1 and ss.cobertura_estricta
    and not coalesce(cc.first_confidence - cc.second_confidence <= ${ambiguityDelta}, false)
    then (ss.section_candidates -> 0 ->> 'cartografia_seccion_id')::bigint end as cartografia_seccion_id,
  case when ss.secciones_candidatas = 1 and ss.cobertura_estricta
    and not coalesce(cc.first_confidence - cc.second_confidence <= ${ambiguityDelta}, false)
    then (ss.section_candidates -> 0 ->> 'seccion_id')::bigint end as seccion_id,
  pg_catalog.jsonb_build_object(
    'candidate_ids', coalesce(cc.candidate_ids, '[]'::jsonb),
    'ambiguous', coalesce(cc.first_confidence - cc.second_confidence <= ${ambiguityDelta}, false),
    'distance_meters', chosen.distancia_metros,
    'name_score', chosen.similitud_nombre,
    'municipality_id', src.municipio_id,
    'source_point', pg_catalog.jsonb_build_array(src.longitud, src.latitud)
  ) as evidencia,
  coalesce(ss.section_candidates, '[]'::jsonb) as section_candidates
from municipalized src
left join chosen using (demografia_localidad_id)
left join candidate_context cc using (demografia_localidad_id)
left join section_summary ss using (demografia_localidad_id);

delete from public.demografia_localidad_correspondencia_secciones child
using public.demografia_localidad_correspondencias parent, demografia_crosswalk_stage stage
where child.demografia_localidad_correspondencia_id = parent.demografia_localidad_correspondencia_id
  and parent.demografia_fuente_id = stage.demografia_fuente_id
  and parent.demografia_localidad_id = stage.demografia_localidad_id
  and parent.cartografia_version_id = ${cartographyVersionId};

insert into public.demografia_localidad_correspondencias (
  demografia_fuente_id, demografia_localidad_id, cartografia_version_id,
  cartografia_limite_localidad_id, cartografia_seccion_id, seccion_id,
  metodo, estado, secciones_candidatas, cobertura_estricta,
  distancia_metros, similitud_nombre, confianza, evidencia
)
select
  demografia_fuente_id, demografia_localidad_id, cartografia_version_id,
  cartografia_limite_localidad_id, cartografia_seccion_id, seccion_id,
  metodo, estado, secciones_candidatas, cobertura_estricta,
  distancia_metros, similitud_nombre, confianza, evidencia
from demografia_crosswalk_stage
on conflict on constraint demografia_localidad_correspondencias_identidad_uk do update set
  cartografia_limite_localidad_id = excluded.cartografia_limite_localidad_id,
  cartografia_seccion_id = excluded.cartografia_seccion_id,
  seccion_id = excluded.seccion_id,
  metodo = excluded.metodo,
  estado = excluded.estado,
  secciones_candidatas = excluded.secciones_candidatas,
  cobertura_estricta = excluded.cobertura_estricta,
  distancia_metros = excluded.distancia_metros,
  similitud_nombre = excluded.similitud_nombre,
  confianza = excluded.confianza,
  evidencia = excluded.evidencia,
  updated_at = pg_catalog.now();

insert into public.demografia_localidad_correspondencia_secciones (
  demografia_localidad_correspondencia_id, cartografia_seccion_id,
  cartografia_version_id, seccion_id, tipo_contacto,
  area_interseccion, proporcion_localidad, evidencia
)
select
  parent.demografia_localidad_correspondencia_id,
  candidate.cartografia_seccion_id,
  stage.cartografia_version_id,
  candidate.seccion_id,
  candidate.tipo_contacto,
  candidate.area_interseccion,
  candidate.proporcion_localidad,
  pg_catalog.jsonb_build_object('weighted', false)
from demografia_crosswalk_stage stage
join public.demografia_localidad_correspondencias parent
  on parent.demografia_fuente_id = stage.demografia_fuente_id
 and parent.demografia_localidad_id = stage.demografia_localidad_id
 and parent.cartografia_version_id = stage.cartografia_version_id
cross join lateral pg_catalog.jsonb_to_recordset(stage.section_candidates) as candidate(
  cartografia_seccion_id bigint, seccion_id bigint, tipo_contacto text,
  area_interseccion numeric, proporcion_localidad numeric
);
commit;
`;
}

export function buildCrosswalkBatch(options) {
  assertConfig(options);
  const config = { ...DEFAULTS, ...options };
  const descriptor = {
    stage: "CORRESPONDENCIAS",
    sourceHash: config.sourceHash,
    cartographyVersionId: config.cartographyVersionId,
    minimumNameScore: config.minimumNameScore,
    ambiguityDelta: config.ambiguityDelta,
    maxDistanceMeters: config.maxDistanceMeters,
  };
  const sql = crosswalkSql(config);
  const checksum = hashRecord({ descriptor, sql });
  return {
    id: `CORRESPONDENCIAS:V${config.cartographyVersionId}`,
    stage: descriptor.stage,
    start: 1,
    end: 1,
    expectedRows: null,
    checksum,
    fileName: `200-correspondencias-v${config.cartographyVersionId}-${checksum.slice(0, 12)}.sql`,
    descriptor,
    sql,
  };
}
