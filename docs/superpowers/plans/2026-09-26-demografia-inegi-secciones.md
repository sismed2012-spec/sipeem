# INEGI Demographics by Electoral Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Apply `superpowers:test-driven-development` to every behavior change and `superpowers:verification-before-completion` before claiming completion. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importar de forma idempotente y reanudable los datos ITER del Censo 2020 de INEGI, conservarlos a nivel localidad y publicar en SIPEEM agregados por sección únicamente cuando una localidad pueda asignarse de forma territorialmente defendible a una sola sección.

**Architecture:** Supabase/PostGIS conserva la fuente canónica, el diccionario, las correspondencias versionadas, los lotes y las materializaciones seccionales. Un importador Node ejecutado fuera del navegador perfila el ZIP, genera lotes SQL deterministas y clasifica correspondencias. Next.js consulta un RPC de lectura a través de una ruta autenticada y muestra cobertura y advertencias en la ficha de sección. La cartografía es una dimensión explícita: cambiar de versión recalcula correspondencias y agregados, sin reimportar el censo.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Node.js, `fflate@0.8.3`, `csv-parse@7.0.3`, Supabase CLI 2.118.0, PostgreSQL/PostGIS, Node test runner + `tsx`.

**Spec:** `docs/superpowers/specs/2026-09-26-demografia-inegi-secciones-design.md`

---

## Global Constraints

- El único destino escribible en esta entrega es SIPEEM-DEV (`nppvprbfmjbhwheghipa`). No incluir una opción de PROD.
- El modo predeterminado del importador es `--dry-run`; toda escritura requiere `--apply` y el `project-ref` exacto.
- No reintentar automáticamente un lote fallido. Un lote confirmado se detecta por su checksum y se omite al reanudar.
- No usar una `service_role` en scripts locales ni imprimir secretos. Las escrituras se ejecutan con Supabase CLI autenticada y archivos SQL auditables.
- No asumir equivalencia entre claves de localidad INE e INEGI.
- No agregar una localidad por punto o centroide. Solo una geometría de localidad cubierta por exactamente una sección puede quedar `DIRECTA`.
- No estimar por superficie, repartir ni duplicar población multisección.
- `*` es reservado/desconocido, nunca cero.
- No sumar promedios o porcentajes. `GRAPROES` se pondera por `P15YMAS`; las razones se derivan de numeradores y denominadores cuando existan.
- Toda tabla pública nueva tendrá RLS habilitada y privilegios explícitos. Las tablas crudas y de proceso no serán consultables por `anon` o `authenticated`.
- Las rutas Next.js serán privadas, autenticadas y `no-store`; la clave privilegiada permanece en servidor.
- Antes de editar código Next.js, leer la documentación local pertinente bajo `node_modules/next/dist/docs/`.
- Preservar todos los cambios preexistentes del árbol de trabajo. Usar commits limitados por ruta y no limpiar, resetear ni reescribir archivos ajenos.
- No aplicar a SIPEEM-DEV hasta completar pruebas unitarias, revisión SQL, preflight de solo lectura y aprobación del paquete de ejecución.

## Review Focus

La revisión debe bloquear la entrega si falla cualquiera de estos casos:

1. El ZIP tiene BOM UTF-8, pero el contenido necesita Windows-1252: el parser debe producir acentos correctos y rechazar caracteres de reemplazo silenciosos.
2. Una celda `*` debe conservar estado reservado y valor numérico `null`.
3. Una localidad cuyo límite toque o cubra más de una sección no puede aportar ningún indicador a `demografia_secciones`.
4. Si una ejecución se interrumpe después de confirmar un lote, la reanudación debe omitir ese lote y continuar con el siguiente sin duplicar filas.
5. Al cambiar `cartografiaVersionId` o sección seleccionada, la interfaz no debe conservar datos demográficos de la selección anterior.
6. `anon` y `authenticated` no pueden leer ni escribir tablas crudas; solo el proceso de servidor puede ejecutar el RPC de resumen.
7. La suma seccional nunca puede exceder el universo de localidades incluidas para la fuente y versión.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `package.json` / lockfile | Modify | Dependencias fijadas y comandos de perfil/importación |
| `.gitignore` | Modify | Excluir `.artifacts/demografia/` |
| `scripts/demografia/iter-parser.mjs` | Create | Abrir ZIP, decodificar y tipar ITER |
| `scripts/demografia/profile.mjs` | Create | Preflight y conciliaciones de origen |
| `scripts/demografia/sql-batches.mjs` | Create | SQL idempotente y checksums de lotes |
| `scripts/demografia/supabase-cli.mjs` | Create | Ejecución única y reanudación segura vía CLI |
| `scripts/demografia/crosswalk.mjs` | Create | Clasificación territorial versionada |
| `scripts/demografia/aggregate.mjs` | Create | Agregación exacta y reporte de calidad |
| `scripts/import-inegi-demografia.mjs` | Create | CLI principal, dry-run por defecto |
| `scripts/demografia/*.test.mjs` | Create | Pruebas unitarias y de reanudación |
| `supabase/migrations/<timestamp>_create_demografia_source_model.sql` | Create | Fuente, diccionario, localidad y lotes |
| `supabase/migrations/<timestamp>_create_demografia_crosswalk_model.sql` | Create | Correspondencias, candidatos, agregados y cobertura |
| `supabase/migrations/<timestamp>_create_demografia_read_api.sql` | Create | RPC, RLS, grants e índices de consulta |
| `supabase/tests/demografia_schema.sql` | Create | Contrato SQL, restricciones y seguridad |
| `src/lib/demografia-types.ts` | Create | Contratos de respuesta compartidos |
| `src/lib/demografia-versionada.ts` | Create | Validación, RPC y normalización |
| `src/lib/demografia-http.ts` | Create | Adaptador HTTP autenticado y errores sanitizados |
| `src/lib/demografia-server.ts` | Create | Invocador Supabase solo servidor |
| `src/app/api/demografia/secciones/[seccionId]/route.ts` | Create | Endpoint privado de resumen por sección |
| `src/components/analytics/DemografiaSeccionCard.tsx` | Create | Estados completo, parcial, pendiente y no disponible |
| `src/components/analytics/SeccionPopup.tsx` | Modify | Cargar y presentar resumen demográfico |
| `src/components/analytics/EdomexInteractiveMap.tsx` | Modify | Propagar la versión cartográfica seleccionada |

---

## Task 0: Reconcile the Migration Baseline Without Touching the Dirty Checkout

**Files:**
- Inspect: `supabase/migrations/`
- Create through CLI in an isolated branch/worktree: missing remote migration files
- Do not modify application code

- [ ] **Step 1: Record the current repository and remote migration state**

Run from `M:\SIPPEEM\sipeem`:

```powershell
git status --short
npm.cmd exec supabase -- --version
npm.cmd exec supabase -- migration list --linked --project-ref nppvprbfmjbhwheghipa
```

Expected: CLI 2.118.0 or compatible; local and remote histories differ. Save the command output under `.artifacts/demografia/migration-baseline.txt` but do not commit it.

- [ ] **Step 2: Create an isolated reconciliation worktree**

Use a dedicated branch from the current committed HEAD. Do not include or alter uncommitted user files from the primary checkout.

```powershell
git worktree add ..\sipeem-demografia-migrations -b chore/reconcile-sipeem-dev-migrations HEAD
```

Expected: a clean worktree at `M:\SIPPEEM\sipeem-demografia-migrations`.

- [ ] **Step 3: Fetch the remote migration history in the isolated worktree**

```powershell
Set-Location M:\SIPPEEM\sipeem-demografia-migrations
npm.cmd exec supabase -- migration fetch --linked --project-ref nppvprbfmjbhwheghipa
npm.cmd exec supabase -- migration list --linked --project-ref nppvprbfmjbhwheghipa
git status --short
```

Expected: remote history is represented locally and the list no longer reports missing remote versions. Do not use `migration repair`, `db reset`, or `db push` here.

- [ ] **Step 4: Review and commit only fetched history**

Verify that fetched files reproduce existing DEV history and contain no credentials. If the CLI removes or rewrites preexisting project migrations, stop and resolve the collision before committing.

```powershell
git diff --check
git add supabase/migrations
git commit -m "chore: reconcile SIPEEM-DEV migration history"
```

Merge or cherry-pick this focused commit into the implementation branch only after reviewing its file list. Keep the primary checkout's unrelated staged and unstaged changes intact.

---

## Task 1: Build the ITER Parser and Source Preflight

**Files:**
- Modify: `package.json`
- Modify: lockfile selected by `npm.cmd`
- Modify: `.gitignore`
- Create: `scripts/demografia/iter-parser.mjs`
- Create: `scripts/demografia/iter-parser.test.mjs`
- Create: `scripts/demografia/profile.mjs`
- Create: `scripts/demografia/profile.test.mjs`
- Create: `scripts/demografia/fixtures/` with tiny synthetic fixtures only

- [ ] **Step 1: Add the exact parser dependencies**

```powershell
npm.cmd install --save-exact fflate@0.8.3 csv-parse@7.0.3
```

Add `.artifacts/demografia/` to `.gitignore`. Do not copy the real census ZIP into the repository.

- [ ] **Step 2: Write failing parser tests**

Cover:

- enumeration and validation of expected ZIP members;
- removal of BOM before Windows-1252 decoding;
- correct decoding of `MÉXICO`, `SAN JOSÉ` and `NIÑOS`;
- quoted CSV fields and exactly 286 columns;
- row classification: state total, municipality total, real locality, `9998`, `9999`;
- `*` mapped to `{ value: null, status: "RESERVADO" }`, while an actual `0` remains numeric zero;
- stable SHA-256 for source and individual row.

Run:

```powershell
node --test scripts/demografia/iter-parser.test.mjs scripts/demografia/profile.test.mjs
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement the minimum parser API**

Export:

```js
export async function readIterArchive(zipPath) {}
export function classifyIterRow(row) {}
export function parseIterValue(raw) {}
export function hashRecord(record) {}
export function buildIterProfile(parsedArchive) {}
```

`readIterArchive` must return source hash, member inventory, normalized headers, dictionary metadata and an async iterable or bounded collection of typed rows. It must throw on missing members, duplicate business keys, unexpected column count or replacement characters after decoding.

- [ ] **Step 4: Make the synthetic tests pass**

```powershell
node --test scripts/demografia/iter-parser.test.mjs scripts/demografia/profile.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Run the real read-only preflight**

```powershell
node scripts/demografia/profile.mjs "G:\Mi unidad\Guardados de Chrome\iter_15_cpv2020_csv.zip" --out .artifacts/demografia/preflight.json
```

Expected hard assertions:

- 5,136 total rows;
- 4,894 real localities;
- 125 municipality totals;
- 116 special rows;
- 286 columns;
- `POBTOT = 16,992,418`;
- no duplicate real locality business keys;
- no missing real-locality coordinates.

This step writes only a local report and must not contact Supabase.

- [ ] **Step 6: Commit the parser slice**

```powershell
git add package.json package-lock.json .gitignore scripts/demografia
git commit -m "feat: parse and profile INEGI ITER demographics"
```

---

## Task 2: Add the Canonical Demographic Schema

**Files:**
- Create with Supabase CLI: `supabase/migrations/<timestamp>_create_demografia_source_model.sql`
- Create: `supabase/tests/demografia_schema.sql`

- [ ] **Step 1: Generate the migration filename**

```powershell
npm.cmd exec supabase -- migration new create_demografia_source_model
```

Use the filename produced by the CLI; never invent or renumber it.

- [ ] **Step 2: Write a failing SQL contract test**

The test must assert existence and constraints for:

- `demografia_fuentes` with unique `(proveedor, conjunto, anio_censal, clave_entidad, archivo_sha256)`;
- `demografia_indicadores` keyed by source and original mnemonic;
- `demografia_cargas_lotes` unique by source, stage, range and checksum;
- `demografia_localidades` unique by source and INEGI locality business key;
- `geom_punto geometry(Point,4326)` and a GIST index;
- typed core indicators and `indicadores jsonb` for the remainder;
- a machine-readable reserved-values structure;
- checks preventing negative counts and invalid batch transitions.

Include a transaction that inserts `*` as `null + RESERVADO`, proves it is not zero, then rolls back.

- [ ] **Step 3: Implement the source-model migration**

Core typed indicator columns:

```text
pobtot, pobfem, pobmas, pob0_14, pob15_64, pob65_mas, p_18ymas,
pea, pocupada, p15ym_an, graproes, pder_ss, pcon_disc, p3ym_hli,
pob_afro, tvivhab, vph_aguadv, vph_drenaj, vph_c_elec,
vph_cel, vph_pc, vph_inter
```

Use `bigint` for additive counts, an appropriate numeric type for averages, explicit foreign keys, timestamps, check constraints and deterministic uniqueness. Enable RLS immediately. Revoke all table privileges from `PUBLIC`, `anon` and `authenticated`; grant required access only to `service_role`.

- [ ] **Step 4: Validate SQL without publishing**

Preferred when local Supabase/Docker works:

```powershell
npm.cmd exec supabase -- db reset
npm.cmd exec supabase -- test db supabase/tests/demografia_schema.sql
```

If Docker is unavailable, do not weaken validation. Execute the migration plus contract inside an explicit transaction against SIPEEM-DEV using `supabase db query`, end with `ROLLBACK`, and verify no persistent object exists afterward.

- [ ] **Step 5: Commit the schema slice**

```powershell
git add supabase/migrations supabase/tests/demografia_schema.sql
git commit -m "feat: add canonical demographic source schema"
```

---

## Task 3: Add Versioned Crosswalk, Aggregate, Coverage and Read RPC

**Files:**
- Create with CLI: `supabase/migrations/<timestamp>_create_demografia_crosswalk_model.sql`
- Create with CLI: `supabase/migrations/<timestamp>_create_demografia_read_api.sql`
- Modify: `supabase/tests/demografia_schema.sql`

- [ ] **Step 1: Write failing spatial integrity tests**

Create tiny polygons in a transaction:

- locality A covered by one section -> eligible for `DIRECTA`;
- locality B intersecting two sections -> must be `MULTISECCION`;
- locality C touching a second section boundary -> must not be considered strictly covered by a single section;
- ambiguous/no match -> `REVISION_MANUAL` or `SIN_CORRESPONDENCIA`;
- a duplicate candidate or double aggregate -> rejected by uniqueness.

Assert that only locality A can feed a section aggregate.

- [ ] **Step 2: Generate and implement the crosswalk migration**

```powershell
npm.cmd exec supabase -- migration new create_demografia_crosswalk_model
```

Create:

- `demografia_localidad_correspondencias`;
- `demografia_localidad_correspondencia_secciones` for all candidate sections and spatial evidence;
- `demografia_secciones` keyed by source, cartography version and stable `seccion_id`;
- `demografia_secciones_cobertura` with nullable percentage and explicit reason when a denominator is not defensible.

Add indexes on source, version, section, status, locality, and GIST spatial evidence where applicable. Foreign keys must reference stable SIPEEM IDs and `cartografia_versiones`.

- [ ] **Step 3: Write failing RPC/security tests**

Assert:

- unknown section/version returns no row, not fabricated zeros;
- returned source and aggregate use the same census and cartography version;
- partial data has `status = PARTIAL`;
- unresolved multisection denominator yields `coverage_percentage = null`;
- `PUBLIC`, `anon`, and `authenticated` lack table privileges;
- `service_role` alone can execute the read RPC;
- the RPC is `SECURITY INVOKER` and has a fixed/controlled `search_path`.

- [ ] **Step 4: Generate and implement the read API migration**

```powershell
npm.cmd exec supabase -- migration new create_demografia_read_api
```

Create `public.rpc_demografia_seccion(p_seccion_id bigint, p_cartografia_version_id bigint, p_anio_censal integer default 2020)` returning one JSON-compatible row with:

```text
section_id, version_id, source, status, coverage, indicators
```

Revoke function execution from `PUBLIC`, `anon` and `authenticated`; grant only to `service_role`. Reassert explicit table grants because table-level grants and RLS are separate controls.

- [ ] **Step 5: Run the SQL contract suite**

```powershell
npm.cmd exec supabase -- test db supabase/tests/demografia_schema.sql
```

Expected: PASS. If using the transactional DEV fallback, expected final state after `ROLLBACK`: no new demographic objects.

- [ ] **Step 6: Commit the spatial schema and RPC**

```powershell
git add supabase/migrations supabase/tests/demografia_schema.sql
git commit -m "feat: add demographic crosswalk and section RPC"
```

---

## Task 4: Build Idempotent SQL Batches and Safe Resume

**Files:**
- Create: `scripts/demografia/sql-batches.mjs`
- Create: `scripts/demografia/sql-batches.test.mjs`
- Create: `scripts/demografia/supabase-cli.mjs`
- Create: `scripts/demografia/supabase-cli.test.mjs`
- Create: `scripts/import-inegi-demografia.mjs`
- Create: `scripts/import-inegi-demografia.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing batch tests**

Test that:

- source, dictionary and locality payloads generate deterministic SQL and checksums;
- payload data is base64-encoded JSON, decoded inside SQL, and never shell-interpolated;
- each batch is one transaction with ledger claim, upsert, count/checksum verification and completion;
- a confirmed batch is skipped;
- a failed/incomplete batch is reported and requires an explicit next invocation;
- interruption after batch N causes resume at N+1;
- no automatic retry occurs;
- a project ref other than `nppvprbfmjbhwheghipa` is rejected before spawning a process;
- omitting `--apply` produces artifacts and a plan but executes no CLI process.

Run:

```powershell
node --test scripts/demografia/sql-batches.test.mjs scripts/demografia/supabase-cli.test.mjs scripts/import-inegi-demografia.test.mjs
```

Expected: FAIL.

- [ ] **Step 2: Implement deterministic batch generation**

Export:

```js
export function buildSourceBatch(profile) {}
export function buildIndicatorBatches(dictionary, options) {}
export function buildLocalityBatches(rows, options) {}
export function checksumBatch(batch) {}
```

Default to 250 locality rows per batch. Artifacts live under `.artifacts/demografia/<source_sha>/` and include manifest, SQL, checksum, row range and expected postflight.

- [ ] **Step 3: Implement the guarded CLI executor**

The only write command constructed by the executor is equivalent to:

```powershell
npm.cmd exec supabase -- db query --linked --project-ref nppvprbfmjbhwheghipa --file <exact-batch.sql>
```

Use argument arrays rather than shell concatenation. Capture redacted stdout/stderr, record the exit code, and stop on the first failure.

- [ ] **Step 4: Implement the command-line contract**

```text
node scripts/import-inegi-demografia.mjs <zip> --project-ref nppvprbfmjbhwheghipa
node scripts/import-inegi-demografia.mjs <zip> --project-ref nppvprbfmjbhwheghipa --apply
```

The first form is dry-run. The second executes only after local preflight assertions pass. Add `demografia:preflight` and `demografia:import` npm scripts using `node`, not `npx`.

- [ ] **Step 5: Make all batch/resume tests pass**

```powershell
node --test scripts/demografia/sql-batches.test.mjs scripts/demografia/supabase-cli.test.mjs scripts/import-inegi-demografia.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit the resumable importer**

```powershell
git add package.json scripts/demografia scripts/import-inegi-demografia.mjs scripts/import-inegi-demografia.test.mjs
git commit -m "feat: add resumable INEGI demographic importer"
```

---

## Task 5: Build the Defensible Crosswalk Classifier

**Files:**
- Create: `scripts/demografia/crosswalk.mjs`
- Create: `scripts/demografia/crosswalk.test.mjs`
- Modify: `scripts/import-inegi-demografia.mjs`

- [ ] **Step 1: Write failing classifier tests**

Cover these exact decisions:

| Evidence | Expected status |
|---|---|
| Municipality polygon contains INEGI point, normalized name/proximity match, locality boundary strictly covered by one section | `DIRECTA` |
| Locality boundary intersects or touches two sections | `MULTISECCION` |
| Point alone lies in one section but locality boundary crosses another | `MULTISECCION` |
| Name candidates conflict or are within ambiguity threshold | `REVISION_MANUAL` |
| No locality geometry match | `SIN_CORRESPONDENCIA` |
| INE and INEGI codes happen to match but spatial/name evidence conflicts | not `DIRECTA` |

Also prove that longitude is passed before latitude and that results are scoped by `cartografia_version_id`.

- [ ] **Step 2: Implement candidate normalization and scoring**

Export pure functions for normalized names, candidate ranking and final classification. Persist all signals—distance, name score, containment, intersection count and candidate IDs—rather than only the winning ID.

- [ ] **Step 3: Implement PostGIS candidate SQL generation**

The SQL must:

1. assign municipality by point-in-versioned-municipality geometry;
2. compare normalized names within that municipality;
3. rank nearby locality boundaries;
4. enumerate every intersecting/touching section candidate;
5. mark `DIRECTA` only when strict single-section coverage is proven;
6. never produce areal weights or point-only aggregates.

- [ ] **Step 4: Make tests pass and commit**

```powershell
node --test scripts/demografia/crosswalk.test.mjs
git add scripts/demografia/crosswalk.mjs scripts/demografia/crosswalk.test.mjs scripts/import-inegi-demografia.mjs
git commit -m "feat: classify demographic locality crosswalks"
```

---

## Task 6: Aggregate Only Direct Localities and Produce Quality Evidence

**Files:**
- Create: `scripts/demografia/aggregate.mjs`
- Create: `scripts/demografia/aggregate.test.mjs`
- Modify: `scripts/import-inegi-demografia.mjs`

- [ ] **Step 1: Write failing aggregation tests**

Test:

- only `DIRECTA` rows contribute additive values;
- `MULTISECCION`, `REVISION_MANUAL` and `SIN_CORRESPONDENCIA` contribute zero rows, not numeric zero indicators;
- each locality is counted once per source/version;
- reserved source values remain absent from arithmetic;
- `GRAPROES` is weighted by non-reserved `P15YMAS`;
- coverage percentage is `null` when no defensible section denominator exists;
- unresolved multisection population is never copied into every candidate section; `pendingPopulationReference` is `null` unless a nonduplicated section-level reference can be proven;
- recomputing the same source/version yields identical rows;
- changing cartography version produces a separate materialization;
- total aggregated population is less than or equal to included source population.

- [ ] **Step 2: Implement transactional materialization**

Generate SQL that replaces only the target `(source_id, cartografia_version_id)` inside one transaction, validates counts and totals, and marks the materialization publishable only after postflight passes.

- [ ] **Step 3: Implement the quality report**

Write `.artifacts/demografia/<source_sha>/quality-report.json` and a readable Markdown companion containing:

- source reconciliation;
- status counts and population by municipality;
- direct and pending localities by section;
- unmatched/ambiguous candidates;
- aggregate totals and invariant results;
- cartography version and all input/output checksums.

- [ ] **Step 4: Make tests pass and commit**

```powershell
node --test scripts/demografia/aggregate.test.mjs
git add scripts/demografia/aggregate.mjs scripts/demografia/aggregate.test.mjs scripts/import-inegi-demografia.mjs
git commit -m "feat: aggregate defensible section demographics"
```

---

## Task 7: Add the Authenticated Demographic Gateway

**Files:**
- Create: `src/lib/demografia-types.ts`
- Create: `src/lib/demografia-versionada.ts`
- Create: `src/lib/demografia-versionada.test.ts`
- Create: `src/lib/demografia-http.ts`
- Create: `src/lib/demografia-http.test.ts`
- Create: `src/lib/demografia-server.ts`
- Create: `src/app/api/demografia/secciones/[seccionId]/route.ts`
- Create: `src/app/api/demografia/secciones/[seccionId]/route.test.ts`

- [ ] **Step 1: Read the local Next.js 16 route-handler documentation**

Locate and read the relevant App Router route-handler and dynamic-route documents under `node_modules/next/dist/docs/`. Record no generated documentation in Git.

- [ ] **Step 2: Write failing contract and HTTP tests**

Define this public shape:

```ts
export interface DemografiaSeccionResponse {
  sectionId: number;
  versionId: number;
  source: { provider: "INEGI"; datasetKey: string; censusYear: number };
  status: "COMPLETE" | "PARTIAL" | "PENDING" | "UNAVAILABLE";
  coverage: {
    includedLocalities: number;
    pendingLocalities: number;
    includedPopulation: number | null;
    pendingPopulationReference: number | null;
    percentage: number | null;
    isAdditive: false;
  };
  indicators: Record<string, number | null>;
}
```

Tests must cover invalid IDs, missing `versionId`, unauthenticated 401, RPC input/output normalization, private/no-store headers, sanitized gateway failures, and correct handling of no row as `UNAVAILABLE` or 404 according to the final route contract.

- [ ] **Step 3: Implement validation and the RPC gateway**

Expose:

```ts
export function parseDemografiaSectionParams(
  sectionId: string,
  searchParams: URLSearchParams
): { sectionId: number; versionId: number; censusYear: number };

export async function getVersionedSectionDemographics(
  invoke: DemografiaRpcInvoker,
  input: { sectionId: number; versionId: number; censusYear: number }
): Promise<DemografiaSeccionResponse>;
```

Follow the existing cartography gateway pattern: `getUsuarioActual`, a server-only service invoker, controlled RPC name, sanitized errors and `Cache-Control: private, no-store`.

- [ ] **Step 4: Implement the dynamic route**

Route contract:

```text
GET /api/demografia/secciones/:seccionId?versionId=:versionId&censusYear=2020
```

Do not accept arbitrary table, column, RPC or filter names from the client.

- [ ] **Step 5: Run gateway tests and typecheck**

```powershell
node --import tsx --test src/lib/demografia-versionada.test.ts src/lib/demografia-http.test.ts "src/app/api/demografia/secciones/[seccionId]/route.test.ts"
& .\node_modules\.bin\tsc.cmd --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit the gateway slice**

```powershell
git add src/lib/demografia-* "src/app/api/demografia/secciones/[seccionId]"
git commit -m "feat: expose authenticated section demographics"
```

---

## Task 8: Show Demographics in the Section Popup Without Stale Data

**Files:**
- Create: `src/components/analytics/DemografiaSeccionCard.tsx`
- Create: `src/components/analytics/DemografiaSeccionCard.test.tsx`
- Modify: `src/components/analytics/SeccionPopup.tsx`
- Modify: `src/components/analytics/EdomexInteractiveMap.tsx`
- Create or modify: focused popup integration test

- [ ] **Step 1: Write failing presentation tests**

Render with `react-dom/server` and assert:

- complete state shows census year and core indicators;
- partial state shows an explicit warning and included/pending counts;
- `coverage.percentage = null` displays `Cobertura no calculable`, not `0%`;
- unavailable state displays `Datos demográficos no disponibles`;
- reserved/missing indicators display `—`, not zero;
- all formatted numbers use `es-MX`.

- [ ] **Step 2: Implement `DemografiaSeccionCard`**

Keep it presentation-only. Group initial fields into population/age, education/economy, social characteristics, housing/services and connectivity. Display source, year, cartography version and coverage before detailed metrics.

- [ ] **Step 3: Write the stale-selection integration test**

Simulate:

1. section A/version 4025 request starts;
2. user selects section B or another version;
3. request A resolves after request B;
4. only B's data can render.

The test must also prove that closing/deselecting the section aborts or invalidates the in-flight request.

- [ ] **Step 4: Integrate the card**

Add `cartografiaVersionId: number` to `SeccionPopup` props. In `EdomexInteractiveMap`, pass `selectedSeccion.versionId`. Fetch with `AbortController` and/or a request token keyed by:

```text
seccionId + cartografiaVersionId + censusYear
```

Clear prior demographic state synchronously when the key changes. Preserve existing municipality/section click, popup drag and resize behavior.

- [ ] **Step 5: Run focused UI tests and typecheck**

```powershell
node --import tsx --test src/components/analytics/DemografiaSeccionCard.test.tsx src/components/analytics/CartografiaVersionSelector.test.tsx src/components/analytics/LayerPanel.test.tsx
& .\node_modules\.bin\tsc.cmd --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit the UI slice**

Because `SeccionPopup.tsx` and `EdomexInteractiveMap.tsx` already contain user changes, inspect their staged and unstaged diffs before adding them. Stage only the intended demographic hunks when possible.

```powershell
git diff -- src/components/analytics/SeccionPopup.tsx src/components/analytics/EdomexInteractiveMap.tsx
git add src/components/analytics/DemografiaSeccionCard.tsx src/components/analytics/DemografiaSeccionCard.test.tsx
git add -p src/components/analytics/SeccionPopup.tsx src/components/analytics/EdomexInteractiveMap.tsx
git commit -m "feat: show demographics in section popup"
```

---

## Task 9: Execute the Controlled SIPEEM-DEV Rollout

**Files:**
- Read: generated manifests and SQL under `.artifacts/demografia/<source_sha>/`
- No PROD files or credentials

- [ ] **Step 1: Run the complete local verification gate**

```powershell
node --test scripts/demografia/iter-parser.test.mjs scripts/demografia/profile.test.mjs scripts/demografia/sql-batches.test.mjs scripts/demografia/supabase-cli.test.mjs scripts/demografia/crosswalk.test.mjs scripts/demografia/aggregate.test.mjs scripts/import-inegi-demografia.test.mjs
node --import tsx --test src/lib/demografia-versionada.test.ts src/lib/demografia-http.test.ts src/components/analytics/DemografiaSeccionCard.test.tsx
& .\node_modules\.bin\tsc.cmd --noEmit
npm.cmd run lint
npm.cmd run build
git diff --check
```

If the local build alone fails with `spawn EPERM`, classify it as an environment constraint only after typecheck/tests pass; use a Preview build for the final build signal. Do not reinterpret a code failure as `EPERM`.

- [ ] **Step 2: Generate and review the real dry-run package**

```powershell
node scripts/import-inegi-demografia.mjs "G:\Mi unidad\Guardados de Chrome\iter_15_cpv2020_csv.zip" --project-ref nppvprbfmjbhwheghipa
```

Review exact row counts, source SHA, batch ranges/checksums, expected writes and the absence of any PROD target.

- [ ] **Step 3: Run a read-only DEV preflight**

Verify:

- project ref is `nppvprbfmjbhwheghipa`;
- target cartography version exists and is the intended published/default version;
- expected source hash is not already partially loaded under a conflicting manifest;
- schema objects and grants match the reviewed migrations;
- no migration-history divergence remains.

- [ ] **Step 4: Apply only the three reviewed migrations to DEV**

Run the normal Supabase migration flow only after history reconciliation. Immediately execute read-only postflight checks for tables, constraints, indexes, RLS, grants and RPC metadata. Stop on any mismatch; do not start import.

- [ ] **Step 5: Execute the canonical import once**

```powershell
node scripts/import-inegi-demografia.mjs "G:\Mi unidad\Guardados de Chrome\iter_15_cpv2020_csv.zip" --project-ref nppvprbfmjbhwheghipa --apply
```

The executor stops at the first failed batch and prints the exact resume command. It must not retry automatically.

- [ ] **Step 6: Execute crosswalk and aggregation once**

Run only after canonical postflight proves 4,894 real localities, 125 municipal totals and 16,992,418 population. Target one explicit cartography version. Stop before publication if any invariant fails.

- [ ] **Step 7: Run read-only postflight and approve publication state**

Confirm:

- no duplicate source locality key;
- no direct correspondence has more than one candidate section;
- no multisection locality contributes to an aggregate;
- aggregate population is bounded by included source population;
- coverage and pending counts reconcile;
- `*` samples remain reserved/null;
- `anon` and `authenticated` cannot access raw tables or RPC;
- service route returns correct section/version metadata.

- [ ] **Step 8: Verify in Preview, not Production**

Open several known complete, partial, pending and unavailable sections. Switch cartography versions and rapidly switch selections to verify stale data never remains visible. Confirm popup drag/resize and map clicks still work.

- [ ] **Step 9: Final evidence and handoff**

Record commit SHAs, migration versions, source hash, batch manifest, quality-report path, test outputs, Preview URL and known pending multisection population. Explicitly state that PROD was not modified.

---

## Final Acceptance Checklist

- [ ] 4,894 canonical localities imported idempotently.
- [ ] State and 125 municipality totals reconcile with the ITER source.
- [ ] No reserved value was converted to zero.
- [ ] Every aggregate is scoped to source + cartography version + stable section ID.
- [ ] Only strict single-section locality geometries contribute.
- [ ] All multisection localities remain visible as pending, not estimated.
- [ ] Import interruption/resume is proven without duplication.
- [ ] RLS and explicit grants pass allow/deny tests.
- [ ] The authenticated API is private/no-store and exposes no arbitrary query surface.
- [ ] The popup displays source, census year, version and honest coverage.
- [ ] A version/section change clears stale demographic data.
- [ ] Full tests, typecheck, lint and build/Preview verification are captured.
- [ ] No production deployment or PROD database mutation occurred.
