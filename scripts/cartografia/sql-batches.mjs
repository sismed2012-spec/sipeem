function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

// Conservative local policy, not a claim about the provider's exact limit.
export function assertCartographyTransportBudget(sql) {
  if (Buffer.byteLength(JSON.stringify({ query: sql }), "utf8") + 4096 > 900_000) {
    throw new Error("Cartography SQL exceeds the transport byte budget; replan before execution");
  }
}

function jsonbBase64(value) {
  const encoded = Buffer.from(JSON.stringify(value), "utf8").toString("base64");
  return `pg_catalog.convert_from(pg_catalog.decode('${encoded}','base64'),'UTF8')::jsonb`;
}

function versionIdQuery(versionKey) {
  return `(select v.cartografia_version_id from public.cartografia_versiones v where v.clave = ${sqlLiteral(versionKey)})`;
}

function loadIdQuery(versionKey) {
  return `(select c.carga_id from public.cargas_cartograficas c join public.cartografia_versiones v on v.cartografia_version_id = c.cartografia_version_id where v.clave = ${sqlLiteral(versionKey)})`;
}

function statement(body) {
  return `begin;\nset local lock_timeout = '10s';\nset local statement_timeout = '15min';\n${body.trim()}\ncommit;\n`;
}

export function buildStartSql({
  versionKey,
  versionName,
  expectedPublicationDate,
  manifest,
}) {
  const mgs = manifest?.packages?.MGS?.sha256;
  const bgd = manifest?.packages?.BGD?.sha256;
  if (!/^[0-9a-f]{64}$/.test(mgs ?? "") || !/^[0-9a-f]{64}$/.test(bgd ?? "")) {
    throw new Error("Manifest package SHA-256 values are required");
  }
  const parsedDate = new Date(`${expectedPublicationDate}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expectedPublicationDate ?? "") ||
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== expectedPublicationDate) {
    throw new Error("Expected publication date must use YYYY-MM-DD");
  }
  return statement(`select public.rpc_iniciar_carga_cartografica(
  ${sqlLiteral(versionKey)},
  ${sqlLiteral(versionName)},
  ${sqlLiteral(expectedPublicationDate)}::date,
  ${sqlLiteral(mgs)},
  ${sqlLiteral(bgd)},
  ${jsonbBase64(manifest)}
);`);
}

export function buildCoverageSql({ versionKey, encodingEvidence, colonyEvidence, limitsEvidence }) {
  const loadId = loadIdQuery(versionKey);
  return statement(`select public.rpc_registrar_codificaciones_cartograficas(
  ${loadId},
  ${jsonbBase64(encodingEvidence)}
);
select public.rpc_registrar_cobertura_colonias(
  ${loadId},
  ${jsonbBase64(colonyEvidence)}
);
select public.rpc_registrar_cobertura_limites_localidad(
  ${loadId},
  ${jsonbBase64(limitsEvidence)}
);`);
}

export function buildImportSql({ versionKey, batch }) {
  if (!batch || !Number.isSafeInteger(batch.desde) || !Number.isSafeInteger(batch.hasta)) {
    throw new Error("A bounded import batch is required");
  }
  const sql = statement(`select public.rpc_importar_lote_cartografico_sin_replay(
  ${loadIdQuery(versionKey)},
  ${sqlLiteral(batch.capa)},
  ${batch.desde},
  ${batch.hasta},
  ${jsonbBase64(batch.features)}
);`);
  assertCartographyTransportBudget(sql);
  return sql;
}

export function buildValidateSql({ versionKey, batchSize = 250 }) {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 250) {
    throw new Error("Validation batch size must be between 1 and 250");
  }
  return statement(`select public.rpc_validar_version_cartografica_lote(
  ${versionIdQuery(versionKey)},
  ${batchSize}
);`);
}

export function buildPublishSql({ versionKey }) {
  return statement(`select public.rpc_publicar_version_cartografica(
  ${versionIdQuery(versionKey)}
);`);
}
