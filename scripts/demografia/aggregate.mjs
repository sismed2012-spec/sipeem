import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { hashRecord } from "./iter-parser.mjs";

const ADDITIVE_FIELDS = [
  "pobtot", "pobfem", "pobmas", "pob0_14", "pob15_64", "pob65_mas",
  "p_18ymas", "pea", "pocupada", "p15ym_an", "pder_ss", "pcon_disc",
  "p3ym_hli", "pob_afro", "tvivhab", "vph_aguadv", "vph_drenaj",
  "vph_c_elec", "vph_cel", "vph_pc", "vph_inter",
];
const STATUSES = ["DIRECTA", "MULTISECCION", "REVISION_MANUAL", "SIN_CORRESPONDENCIA"];

function sumPresent(rows, field) {
  const values = rows.map((row) => row[field]).filter((value) => Number.isFinite(value));
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0);
}

function sectionKey(cartographySectionId, sectionId) {
  return `${cartographySectionId}:${sectionId}`;
}

function assertInputs({ sourceHash, cartographyVersionId }) {
  if (!/^[0-9a-f]{64}$/.test(sourceHash ?? "")) throw new Error("sourceHash must be SHA-256");
  if (!Number.isSafeInteger(cartographyVersionId) || cartographyVersionId <= 0) {
    throw new Error("cartographyVersionId must be a positive integer");
  }
}

export function aggregateSections(input) {
  assertInputs(input);
  const localityById = new Map(input.localities.map((locality) => [locality.id, locality]));
  const correspondenceByLocality = new Map();
  for (const correspondence of input.correspondences) {
    if (correspondenceByLocality.has(correspondence.localityId)) {
      throw new Error(`Locality ${correspondence.localityId} appears more than once`);
    }
    if (!localityById.has(correspondence.localityId)) {
      throw new Error(`Correspondence references unknown locality ${correspondence.localityId}`);
    }
    correspondenceByLocality.set(correspondence.localityId, correspondence);
  }

  const sectionMap = new Map();
  const ensureSection = (candidate) => {
    const key = sectionKey(candidate.cartographySectionId, candidate.sectionId);
    if (!sectionMap.has(key)) {
      sectionMap.set(key, { ...candidate, directRows: [], pendingLocalityIds: new Set() });
    }
    return sectionMap.get(key);
  };

  for (const correspondence of input.correspondences) {
    const locality = localityById.get(correspondence.localityId);
    if (correspondence.status === "DIRECTA") {
      ensureSection(correspondence).directRows.push(locality);
      continue;
    }
    for (const candidate of correspondence.candidateSections ?? []) {
      ensureSection(candidate).pendingLocalityIds.add(locality.id);
    }
  }

  const sections = [...sectionMap.values()]
    .map((section) => {
      const row = {
        sourceHash: input.sourceHash,
        cartographyVersionId: input.cartographyVersionId,
        cartographySectionId: section.cartographySectionId,
        sectionId: section.sectionId,
        localitiesIncluded: section.directRows.length,
        pendingLocalities: section.pendingLocalityIds.size,
        includedPopulation: sumPresent(section.directRows, "pobtot"),
        pendingPopulationReference: null,
        pendingPopulationReferenceDefensible: false,
        coveragePercentage: null,
        coverageReason: "SIN_DENOMINADOR_SECCIONAL_DEFENDIBLE",
      };
      for (const field of ADDITIVE_FIELDS) row[field] = sumPresent(section.directRows, field);
      const weightedRows = section.directRows.filter((locality) => (
        Number.isFinite(locality.graproes)
        && Number.isFinite(locality.p15ymas)
        && locality.p15ymas > 0
      ));
      const weight = weightedRows.reduce((sum, locality) => sum + locality.p15ymas, 0);
      row.graproes = weight === 0 ? null : weightedRows.reduce(
        (sum, locality) => sum + locality.graproes * locality.p15ymas,
        0
      ) / weight;
      row.confidence = section.directRows.length === 0 ? 0 : input.correspondences
        .filter((correspondence) => (
          correspondence.status === "DIRECTA"
          && correspondence.cartographySectionId === section.cartographySectionId
          && correspondence.sectionId === section.sectionId
        ))
        .reduce((sum, correspondence) => sum + (correspondence.confidence ?? 0), 0)
        / section.directRows.length;
      return row;
    })
    .sort((left, right) => left.sectionId - right.sectionId
      || left.cartographySectionId - right.cartographySectionId);

  const includedSourcePopulation = sumPresent(
    input.correspondences
      .filter(({ status }) => status === "DIRECTA")
      .map(({ localityId }) => localityById.get(localityId)),
    "pobtot"
  ) ?? 0;
  const aggregatePopulation = sections.reduce((sum, section) => sum + (section.pobtot ?? 0), 0);
  return {
    sourceHash: input.sourceHash,
    cartographyVersionId: input.cartographyVersionId,
    sections,
    totals: { includedSourcePopulation, aggregatePopulation },
    invariants: {
      directLocalitiesCountedOnce: true,
      multisectionExcludedFromArithmetic: true,
      pendingPopulationNotDuplicated: sections.every(
        ({ pendingPopulationReference }) => pendingPopulationReference === null
      ),
      aggregatePopulationAtMostIncluded: aggregatePopulation <= includedSourcePopulation,
    },
  };
}

function aggregateSql({ sourceHash, cartographyVersionId }) {
  const sumColumns = ADDITIVE_FIELDS.filter((field) => field !== "pobtot");
  const aggregateSelect = sumColumns.map((field) => `    pg_catalog.sum(d.${field}) as ${field}`).join(",\n");
  const stageColumns = sumColumns.map((field) => `a.${field}`).join(", ");
  return `begin;
set constraints all deferred;

create temporary table demografia_direct_stage on commit drop as
select
  c.demografia_fuente_id,
  c.demografia_localidad_id,
  c.cartografia_seccion_id,
  c.seccion_id,
  c.confianza
from public.demografia_localidad_correspondencias c
join public.demografia_fuentes f using (demografia_fuente_id)
where f.archivo_sha256 = '${sourceHash}'
  and c.cartografia_version_id = ${cartographyVersionId}
  and c.estado = 'DIRECTA';

do $validate_direct$
begin
  if exists (
    select 1 from demografia_direct_stage
    group by demografia_localidad_id having pg_catalog.count(*) > 1
  ) then
    raise exception 'a locality contributes more than once to the direct aggregate';
  end if;
end
$validate_direct$;

create temporary table demografia_pending_stage on commit drop as
select distinct
  c.demografia_fuente_id,
  child.cartografia_seccion_id,
  child.seccion_id,
  c.demografia_localidad_id
from public.demografia_localidad_correspondencias c
join public.demografia_fuentes f using (demografia_fuente_id)
join public.demografia_localidad_correspondencia_secciones child
  using (demografia_localidad_correspondencia_id)
where f.archivo_sha256 = '${sourceHash}'
  and c.cartografia_version_id = ${cartographyVersionId}
  and c.estado in ('MULTISECCION', 'REVISION_MANUAL');

create temporary table demografia_aggregate_stage on commit drop as
with relevant_sections as (
  select demografia_fuente_id, cartografia_seccion_id, seccion_id from demografia_direct_stage
  union
  select demografia_fuente_id, cartografia_seccion_id, seccion_id from demografia_pending_stage
), additive as (
  select
    direct.demografia_fuente_id,
    direct.cartografia_seccion_id,
    direct.seccion_id,
    pg_catalog.count(*)::integer as localidades_incluidas,
    pg_catalog.sum(d.pobtot) as pobtot,
${aggregateSelect},
    case when pg_catalog.sum(
      case when d.graproes is not null
        and (d.indicadores ->> 'P15YMAS')::numeric > 0
      then (d.indicadores ->> 'P15YMAS')::numeric else 0 end
    ) > 0 then
      pg_catalog.sum(
        case when d.graproes is not null
          and (d.indicadores ->> 'P15YMAS')::numeric > 0
        then d.graproes * (d.indicadores ->> 'P15YMAS')::numeric else 0 end
      ) / pg_catalog.sum(
        case when d.graproes is not null
          and (d.indicadores ->> 'P15YMAS')::numeric > 0
        then (d.indicadores ->> 'P15YMAS')::numeric else 0 end
      )
    end as graproes,
    pg_catalog.avg(direct.confianza) as confianza
  from demografia_direct_stage direct
  join public.demografia_localidades d using (demografia_localidad_id)
  group by direct.demografia_fuente_id, direct.cartografia_seccion_id, direct.seccion_id
), pending as (
  select demografia_fuente_id, cartografia_seccion_id, seccion_id,
         pg_catalog.count(distinct demografia_localidad_id)::integer as localidades_pendientes
  from demografia_pending_stage
  group by demografia_fuente_id, cartografia_seccion_id, seccion_id
)
select
  r.demografia_fuente_id,
  ${cartographyVersionId}::bigint as cartografia_version_id,
  r.cartografia_seccion_id,
  r.seccion_id,
  coalesce(a.localidades_incluidas, 0)::integer as localidades_incluidas,
  coalesce(p.localidades_pendientes, 0)::integer as localidades_pendientes,
  a.pobtot as poblacion_incluida,
  a.pobtot,
  ${stageColumns},
  a.graproes,
  coalesce(a.confianza, 0)::numeric as confianza
from relevant_sections r
left join additive a using (demografia_fuente_id, cartografia_seccion_id, seccion_id)
left join pending p using (demografia_fuente_id, cartografia_seccion_id, seccion_id);

delete from public.demografia_secciones ds
using public.demografia_fuentes f
where ds.demografia_fuente_id = f.demografia_fuente_id
  and f.archivo_sha256 = '${sourceHash}'
  and ds.cartografia_version_id = ${cartographyVersionId};

insert into public.demografia_secciones (
  demografia_fuente_id, cartografia_version_id, cartografia_seccion_id, seccion_id,
  localidades_incluidas, poblacion_incluida, pobtot,
  ${sumColumns.join(", ")}, graproes, indicadores
)
select
  demografia_fuente_id, cartografia_version_id, cartografia_seccion_id, seccion_id,
  localidades_incluidas, poblacion_incluida, pobtot,
  ${sumColumns.join(", ")}, graproes, '{}'::jsonb
from demografia_aggregate_stage;

insert into public.demografia_secciones_cobertura (
  demografia_seccion_id, localidades_incluidas, localidades_pendientes,
  poblacion_incluida, poblacion_pendiente_referencia,
  referencia_pendiente_defendible, porcentaje_cobertura,
  razon_porcentaje_nulo, metodo, confianza, advertencias
)
select
  ds.demografia_seccion_id, stage.localidades_incluidas, stage.localidades_pendientes,
  stage.poblacion_incluida, null, false, null,
  'SIN_DENOMINADOR_SECCIONAL_DEFENDIBLE', 'SOLO_DIRECTAS', stage.confianza,
  case when stage.localidades_pendientes > 0
    then pg_catalog.jsonb_build_array('LOCALIDADES_PENDIENTES_SIN_ASIGNACION_ADITIVA')
    else '[]'::jsonb end
from demografia_aggregate_stage stage
join public.demografia_secciones ds
  on ds.demografia_fuente_id = stage.demografia_fuente_id
 and ds.cartografia_version_id = stage.cartografia_version_id
 and ds.seccion_id = stage.seccion_id;

do $postflight$
declare
  v_included numeric;
  v_aggregate numeric;
begin
  select coalesce(pg_catalog.sum(d.pobtot), 0) into v_included
  from demografia_direct_stage direct
  join public.demografia_localidades d using (demografia_localidad_id);

  select coalesce(pg_catalog.sum(ds.pobtot), 0) into v_aggregate
  from public.demografia_secciones ds
  join public.demografia_fuentes f using (demografia_fuente_id)
  where f.archivo_sha256 = '${sourceHash}'
    and ds.cartografia_version_id = ${cartographyVersionId};

  if v_aggregate > v_included then
    raise exception 'aggregate population exceeds included source population: % > %', v_aggregate, v_included;
  end if;

  if exists (
    select 1
    from public.demografia_localidad_correspondencias c
    join demografia_direct_stage direct using (demografia_localidad_id)
    where c.cartografia_version_id = ${cartographyVersionId}
      and c.estado <> 'DIRECTA'
  ) then
    raise exception 'non-direct locality entered the aggregate';
  end if;
end
$postflight$;

update public.demografia_fuentes
set estado = 'VALIDADA', validated_at = coalesce(validated_at, pg_catalog.now()),
    updated_at = pg_catalog.now()
where archivo_sha256 = '${sourceHash}'
  and estado <> 'PUBLICADA';
commit;
`;
}

export function buildAggregateBatch(options) {
  assertInputs(options);
  const descriptor = {
    stage: "AGREGACION",
    sourceHash: options.sourceHash,
    cartographyVersionId: options.cartographyVersionId,
    method: "SOLO_DIRECTAS",
  };
  const sql = aggregateSql(options);
  const checksum = hashRecord({ descriptor, sql });
  return {
    id: `AGREGACION:V${options.cartographyVersionId}`,
    stage: descriptor.stage,
    start: 1,
    end: 1,
    expectedRows: null,
    checksum,
    fileName: `300-agregacion-v${options.cartographyVersionId}-${checksum.slice(0, 12)}.sql`,
    descriptor,
    sql,
  };
}

export function buildQualityReport(input) {
  const counts = Object.fromEntries(STATUSES.map((status) => [status, 0]));
  const populationByMunicipality = {};
  const localityById = new Map(input.localities.map((locality) => [locality.id, locality]));
  for (const correspondence of input.correspondences) {
    counts[correspondence.status] += 1;
    const locality = localityById.get(correspondence.localityId);
    const municipality = locality?.municipality ?? "SIN_MUNICIPIO";
    populationByMunicipality[municipality] ??= Object.fromEntries(
      STATUSES.map((status) => [status, { localities: 0, population: 0 }])
    );
    populationByMunicipality[municipality][correspondence.status].localities += 1;
    populationByMunicipality[municipality][correspondence.status].population += locality?.pobtot ?? 0;
  }
  return {
    generatedAt: input.generatedAt ?? null,
    source: {
      ...input.source,
      reconciled: input.source.hash === input.materialization.sourceHash
        && input.source.localities >= input.correspondences.length,
    },
    cartographyVersionId: input.cartographyVersionId,
    statuses: { counts, populationByMunicipality },
    sections: input.materialization.sections.map((section) => ({
      sectionId: section.sectionId,
      cartographySectionId: section.cartographySectionId,
      directLocalities: section.localitiesIncluded,
      pendingLocalities: section.pendingLocalities,
      includedPopulation: section.pobtot,
      pendingPopulationReference: section.pendingPopulationReference,
      coveragePercentage: section.coveragePercentage,
      coverageReason: section.coverageReason,
    })),
    unresolved: input.correspondences
      .filter(({ status }) => status !== "DIRECTA")
      .map(({ localityId, status, candidateSections = [] }) => ({
        localityId,
        status,
        candidateSectionIds: candidateSections.map(({ sectionId }) => sectionId),
      })),
    aggregateTotals: input.materialization.totals,
    invariants: input.materialization.invariants,
    checksums: { input: input.inputChecksums, output: input.outputChecksums },
  };
}

function qualityMarkdown(report) {
  const statusRows = STATUSES.map(
    (status) => `| ${status} | ${report.statuses.counts[status]} |`
  ).join("\n");
  const sectionRows = report.sections.map((section) => (
    `| ${section.sectionId} | ${section.directLocalities} | ${section.pendingLocalities} | ${section.includedPopulation ?? "null"} | ${section.coverageReason} |`
  )).join("\n");
  return `# Demographic quality report

- Source SHA-256: \`${report.source.hash}\`
- Cartography version: \`${report.cartographyVersionId}\`
- Source reconciled: **${report.source.reconciled}**

## Statuses

| Status | Localities |
|---|---:|
${statusRows}

## Sections

| Section | Direct | Pending | Included population | Coverage |
|---:|---:|---:|---:|---|
${sectionRows}

## Invariants

\`\`\`json
${JSON.stringify(report.invariants, null, 2)}
\`\`\`
`;
}

export async function writeQualityReport(report, rootDirectory) {
  await mkdir(rootDirectory, { recursive: true });
  const jsonPath = path.join(rootDirectory, "quality-report.json");
  const markdownPath = path.join(rootDirectory, "quality-report.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, qualityMarkdown(report), "utf8");
  return { jsonPath, markdownPath };
}
