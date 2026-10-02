import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  buildCoverageSql,
  buildImportSql,
  buildPublishSql,
  buildStartSql,
  buildValidateSql,
} from "./sql-batches.mjs";

const manifest = {
  schema_version: 1,
  clave_entidad: "15",
  srid_origen: 32614,
  srid_destino: 4326,
  packages: {
    MGS: { nombre: "mgs.zip", sha256: "a".repeat(64), bytes: 10 },
    BGD: { nombre: "bgd.zip", sha256: "b".repeat(64), bytes: 20 },
  },
  layers: [],
};

describe("cartography SQL artifacts", () => {
  it("uses the version lookup column declared in the territorial schema", () => {
    const schema = readFileSync(new URL("../../infra/territorial/supabase/migrations/20260913170926_cartografia_versiones_control.sql", import.meta.url), "utf8");
    assert.match(schema, /\bclave\s+text\s+not null/i);
    const sql = buildPublishSql({ versionKey: "INE_2026" });
    assert.match(sql, /v\.clave = 'INE_2026'/);
    assert.doesNotMatch(sql, /v\.clave_version/);
  });
  it("builds a start RPC without interpolating JSON as SQL text", () => {
    const sql = buildStartSql({
      versionKey: "INE-2026'B",
      versionName: "INE actualización 2026",
      expectedPublicationDate: "2026-11-12",
      manifest,
    });
    assert.match(sql, /rpc_iniciar_carga_cartografica/);
    assert.match(sql, /INE-2026''B/);
    assert.match(sql, /convert_from\(pg_catalog\.decode\('[A-Za-z0-9+/=]+','base64'\),'UTF8'\)::jsonb/);
    assert.doesNotMatch(sql, /"schema_version"/);
  });

  it("rejects a calendar-invalid publication date before generating SQL", () => {
    assert.throws(() => buildStartSql({
      versionKey: "INE-2026",
      versionName: "INE actualización 2026",
      expectedPublicationDate: "2026-02-31",
      manifest,
    }), /YYYY-MM-DD/);
  });

  it("registers both immutable coverage receipts before import", () => {
    const sql = buildCoverageSql({
      versionKey: "INE-2026",
      encodingEvidence: { schema_version: 1 },
      colonyEvidence: { schema_version: 1 },
      limitsEvidence: { schema_version: 1 },
    });
    assert.match(sql, /rpc_registrar_codificaciones_cartograficas/);
    assert.match(sql, /rpc_registrar_cobertura_colonias/);
    assert.match(sql, /rpc_registrar_cobertura_limites_localidad/);
    assert.match(sql, /select c\.carga_id[\s\S]+v\.clave = 'INE-2026'/);
  });

  it("uses the no-replay RPC and exact contiguous batch bounds", () => {
    const sql = buildImportSql({
      versionKey: "INE-2026",
      batch: {
        capa: "SECCION",
        desde: 251,
        hasta: 500,
        features: [{ fila: 251 }],
      },
    });
    assert.match(sql, /rpc_importar_lote_cartografico_sin_replay/);
    assert.match(sql, /'SECCION',\s*251,\s*500/);
    assert.match(sql, /v\.clave = 'INE-2026'/);
  });

  it("keeps validation and publication as separate one-shot commands", () => {
    const validation = buildValidateSql({ versionKey: "INE-2026", batchSize: 250,
      checkpoint: { schema_version: 1, project_ref: "nppvprbfmjbhwheghipa", version_key: "INE-2026",
        cartografia_version_id: 4037, fase: "SIN_INICIAR", cursor: {}, snapshot_sha256: "a".repeat(64) } });
    const publication = buildPublishSql({ versionKey: "INE-2026" });
    assert.match(validation, /rpc_validar_version_cartografica_paso_exacto/);
    assert.doesNotMatch(validation, /rpc_publicar_version_cartografica/);
    assert.match(publication, /rpc_publicar_version_cartografica/);
    assert.doesNotMatch(publication, /rpc_validar_version_cartografica_paso_exacto/);
  });
});
