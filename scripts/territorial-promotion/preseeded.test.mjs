import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  comparePreseededReports,
  parsePreseededReport,
} from "./preseeded.mjs";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const EXPECTED = [
  { table: "public.cat_alpha", ownedSequences: ["public.cat_alpha_id_seq"] },
  { table: "public.cat_beta", ownedSequences: [] },
];

function report(overrides = {}) {
  return {
    contractVersion: 1,
    kind: "promotion_preseeded_catalogs",
    tables: [
      {
        table: "public.cat_alpha",
        rowCount: 2,
        rowsSha256: SHA_A,
        sequences: [{
          name: "public.cat_alpha_id_seq",
          lastValue: 2,
          isCalled: true,
        }],
      },
      {
        table: "public.cat_beta",
        rowCount: 1,
        rowsSha256: SHA_B,
        sequences: [],
      },
    ],
    ...overrides,
  };
}

test("parses direct and single-row wrapped preseeded reports canonically", () => {
  const direct = parsePreseededReport(JSON.stringify(report()));
  const wrapped = parsePreseededReport(JSON.stringify({
    rows: [{ payload: report({ tables: [...report().tables].reverse() }) }],
  }));
  assert.deepEqual(direct, wrapped);
  assert.deepEqual(direct.tables.map(({ table }) => table), [
    "public.cat_alpha",
    "public.cat_beta",
  ]);
});

test("passes only exact row and sequence parity", () => {
  const result = comparePreseededReports({
    source: report(),
    target: report(),
    expectedTables: EXPECTED,
  });
  assert.equal(result.status, "PASSED");
  assert.deepEqual(result.issues, []);
  assert.match(result.evidenceSha256, /^[a-f0-9]{64}$/u);
});

test("blocks each row or sequence difference independently", () => {
  const variants = [
    [{ ...report().tables[0], rowCount: 3 }, "ROW_COUNT_MISMATCH"],
    [{ ...report().tables[0], rowsSha256: "c".repeat(64) }, "ROW_HASH_MISMATCH"],
    [{
      ...report().tables[0],
      sequences: [{ ...report().tables[0].sequences[0], lastValue: 3 }],
    }, "SEQUENCE_STATE_MISMATCH"],
    [{
      ...report().tables[0],
      sequences: [{ ...report().tables[0].sequences[0], isCalled: false }],
    }, "SEQUENCE_STATE_MISMATCH"],
  ];
  for (const [changed, code] of variants) {
    const result = comparePreseededReports({
      source: report(),
      target: report({ tables: [changed, report().tables[1]] }),
      expectedTables: EXPECTED,
    });
    assert.equal(result.status, "BLOCKED");
    assert.ok(result.issues.some((issue) => issue.code === code));
  }
});

test("rejects missing, extra, malformed, or duplicate report identities", () => {
  const missing = report({ tables: [report().tables[0]] });
  const extra = report({ tables: [...report().tables, {
    table: "public.cat_extra",
    rowCount: 0,
    rowsSha256: SHA_A,
    sequences: [],
  }] });
  const malformed = report({ tables: [
    { ...report().tables[0], rowsSha256: "bad" },
    report().tables[1],
  ] });
  const duplicate = report({ tables: [report().tables[0], report().tables[0]] });

  for (const source of [missing, extra]) {
    assert.throws(
      () => comparePreseededReports({ source, target: report(), expectedTables: EXPECTED }),
      /expected|table/iu,
    );
  }
  assert.throws(() => parsePreseededReport(JSON.stringify(malformed)), /sha/iu);
  assert.throws(() => parsePreseededReport(JSON.stringify(duplicate)), /duplicate/iu);
});

test("rejects an expected sequence-set mismatch before comparing state", () => {
  assert.throws(
    () => comparePreseededReports({
      source: report(),
      target: report(),
      expectedTables: [{ ...EXPECTED[0], ownedSequences: [] }, EXPECTED[1]],
    }),
    /sequence/iu,
  );
});

test("ships one read-only preseeded probe without row contents", async () => {
  const sql = await readFile(
    "infra/territorial/supabase/tests/promotion_preseeded_catalogs.sql",
    "utf8",
  );
  const withoutComments = sql.replace(/--.*$/gmu, "");
  assert.match(sql, /^\s*(?:with\b|select\b)/iu);
  assert.doesNotMatch(
    withoutComments,
    /\b(?:insert|update|delete|merge|create|alter|drop|truncate|grant|revoke|call|do|copy)\b/iu,
  );
  assert.equal((sql.match(/;\s*(?=\s*$)/gu) ?? []).length, 1);
  for (const table of [
    "cat_estados_evento",
    "cat_estados_georreferenciacion",
    "cat_fuentes_evento",
    "cat_niveles_sensibilidad",
    "cat_tipos_asentamiento",
    "cat_tipos_fuerza_electoral",
  ]) assert.match(sql, new RegExp(table, "u"));
  for (const sequence of [
    "cat_estados_evento_estado_evento_id_seq",
    "cat_estados_georreferenciacion_estado_geo_id_seq",
    "cat_fuentes_evento_fuente_evento_id_seq",
    "cat_tipos_asentamiento_tipo_asentamiento_id_seq",
    "cat_tipos_fuerza_electoral_tipo_fuerza_id_seq",
  ]) assert.match(sql, new RegExp(sequence, "u"));
  assert.doesNotMatch(sql, /jsonb_pretty|rowContents|rows\s*:/iu);
});
