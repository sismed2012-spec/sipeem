# Lista nominal INE por sección Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importar el corte INE 2026-07-31 de padrón y lista nominal por sección, relacionarlo de forma versionada con la cartografía 4025 y mostrarlo en SIPEEM sin alterar elecciones históricas ni Producción.

**Architecture:** El archivo se conserva como un corte nominal inmutable e independiente de las elecciones. Sus filas se vinculan a cada versión cartográfica mediante una tabla de correspondencias exactas por entidad, municipio y sección; los datos se exponen mediante RPC de lectura y una ruta autenticada de Next.js. El importador es determinista, idempotente, reanudable y restringido a SIPEEM-DEV.

**Tech Stack:** Node.js, `@e965/xlsx`, PostgreSQL 15/17, Supabase CLI 2.118+, Next.js 16 App Router, TypeScript, React 19, `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-28-lista-nominal-ine-secciones-design.md`

## Global Constraints

- La única fuente de esta entrega es `C:\Users\NZXT\Downloads\S.xlsx`, SHA-256 `D016713ED9304AE696FBCF875141CF8268799D05468F1AFB79BB8785227DE161`.
- El corte esperado es `2026-07-31`, con 7,191 secciones y una fila `0000` de residentes en el extranjero.
- La única base escribible es SIPEEM-DEV (`nppvprbfmjbhwheghipa`). No incluir una opción de PROD.
- La cartografía inicial es la versión 4025; no crear, copiar ni inferir geometrías.
- Una correspondencia exige entidad, municipio y sección exactos. Nunca resolver sólo por número.
- Conservar las 190 filas fuente no vinculadas y reportar las 51 secciones 4025 sin dato exacto.
- No modificar `public.listas_nominales`, elecciones, resultados o participación histórica.
- No almacenar el XLSX ni credenciales en Git.
- Las cargas usan lotes deterministas, checksum, reanudación y cero reintentos automáticos.
- Todas las tablas expuestas activan RLS y revocan acceso directo a `anon` y `authenticated`.
- Todas las RPC públicas son `SECURITY INVOKER`; el `service_role` sólo se usa en servidor.
- Respetar los cambios existentes del worktree y añadir a cada commit únicamente los archivos de la tarea.

## Review Focus

- Celdas combinadas: los nombres de municipio y distrito pueden venir vacíos en filas posteriores, pero sólo los nombres se heredan; las claves nunca se inventan.
- Fila `0000`: se conserva en el corte como residentes en el extranjero y no se trata como sección cartográfica.
- Reseccionamiento: 696 y 6593 deben quedar pendientes en 4025 porque cambió el municipio, aunque exista el número.
- Reejecución: el mismo SHA-256 y los mismos checksums no pueden duplicar cortes, filas ni correspondencias.
- Interrupción: una falla de lote debe detenerse una sola vez y reanudar desde el último checksum confirmado.
- Ausencia de dato: la API y la interfaz deben devolver `UNAVAILABLE`/“Sin dato nominal para este corte”, nunca cero plausible.

---

### Task 1: Parser y perfil verificable del XLSX del INE

**Files:**
- Create: `scripts/lista-nominal/ine-parser.mjs`
- Create: `scripts/lista-nominal/ine-parser.test.mjs`
- Create: `scripts/lista-nominal/profile.mjs`
- Create: `scripts/lista-nominal/profile.test.mjs`

**Interfaces:**
- Produces: `readListaNominalWorkbook(filePath) -> Promise<ListaNominalArchive>`
- Produces: `normalizeListaNominalRows(matrix) -> { sections, foreignResidents, cutoffDate }`
- Produces: `buildListaNominalProfile(archive) -> ListaNominalProfile`
- Produces: `assertExpectedListaNominalProfile(profile) -> profile`

- [ ] **Step 1: Write failing parser tests**

Test that a workbook fixture with the two-row header parses typed integers, reads `Fecha de corte 31 de julio de 2026`, preserves leading-zero keys, inherits only merged name cells, and separates section `0000`.

- [ ] **Step 2: Run the parser tests and verify RED**

Run:

```powershell
node --test scripts/lista-nominal/ine-parser.test.mjs
```

Expected: FAIL because `ine-parser.mjs` does not exist.

- [ ] **Step 3: Implement the minimal parser**

Use `@e965/xlsx` with raw typed values. Validate the exact title and header cells before reading rows 14 onward. Return source row numbers and the original numeric coverage without mutating the workbook.

- [ ] **Step 4: Run the parser tests and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Write failing profile tests**

Assert duplicate detection, nonnegative counts, sex-total reconciliation, difference reconciliation, coverage tolerance, the one foreign-resident row, and the exact production profile:

```text
sections=7191 municipalities=125 federalDistricts=40 localDistricts=45
padron=13407250 nominal=13206301 difference=200949
```

- [ ] **Step 6: Run profile tests and verify RED**

```powershell
node --test scripts/lista-nominal/profile.test.mjs
```

Expected: FAIL because profile validation is missing.

- [ ] **Step 7: Implement profile validation and run against `S.xlsx`**

```powershell
node scripts/lista-nominal/profile.mjs 'C:\Users\NZXT\Downloads\S.xlsx'
```

Expected: JSON with the exact profile and SHA-256 from Global Constraints.

- [ ] **Step 8: Run both test files and commit only Task 1**

```powershell
node --test scripts/lista-nominal/ine-parser.test.mjs scripts/lista-nominal/profile.test.mjs
git add scripts/lista-nominal/ine-parser.mjs scripts/lista-nominal/ine-parser.test.mjs scripts/lista-nominal/profile.mjs scripts/lista-nominal/profile.test.mjs
git commit --only scripts/lista-nominal/ine-parser.mjs scripts/lista-nominal/ine-parser.test.mjs scripts/lista-nominal/profile.mjs scripts/lista-nominal/profile.test.mjs -m "feat: parse INE nominal-list workbooks"
```

### Task 2: Esquema versionado, restricciones y seguridad

**Files:**
- Create via CLI: `supabase/migrations/<generated>_lista_nominal_versionada.sql`
- Create: `supabase/tests/lista_nominal_schema_preflight.sql`
- Create: `supabase/tests/lista_nominal_schema.sql`

**Interfaces:**
- Produces: `public.lista_nominal_cortes`
- Produces: `public.lista_nominal_secciones`
- Produces: `public.lista_nominal_correspondencias`
- Produces: publication/immutability guards in `territorial_private`

- [ ] **Step 1: Write the failing transactional database contract**

The SQL test must begin a transaction and roll it back. Assert table/column types, unique keys, FK shapes, indexes, RLS, explicit privileges, valid state transitions, published-row immutability, sex totals, difference, coverage, and nullable IDs only for non-`VINCULADA` correspondences.

- [ ] **Step 2: Run the contract against SIPEEM-DEV and verify RED**

```powershell
npm.cmd exec supabase -- db query --linked --project-ref nppvprbfmjbhwheghipa --file supabase/tests/lista_nominal_schema.sql
```

Expected: FAIL on the first missing nominal-list table.

- [ ] **Step 3: Create the migration with the CLI**

```powershell
npm.cmd exec supabase -- migration new lista_nominal_versionada
```

Use the exact generated migration path for the remaining steps; do not invent or duplicate a timestamp.

- [ ] **Step 4: Implement the schema**

Add the three tables, checks, indexes, state guards, RLS and explicit grants described by the spec. Store the foreign-resident aggregate on the cut row. Grant table and sequence access only to `service_role` and owner roles.

- [ ] **Step 5: Inspect migration SQL before any remote write**

```powershell
git diff --check -- supabase/migrations supabase/tests/lista_nominal_schema.sql
rg -n "security definer|grant .*anon|grant .*authenticated|drop table|truncate" supabase/migrations/<generated>_lista_nominal_versionada.sql
```

Expected: no `SECURITY DEFINER`, no client grants, and no destructive statement against existing tables.

- [ ] **Step 6: Run the schema preflight and apply only this migration once in DEV**

Verify `supabase/.temp/project-ref` equals `nppvprbfmjbhwheghipa`; the SQL
preflight must verify that none of the three target tables exists. Then execute
the exact reviewed migration file once:

```powershell
npm.cmd exec supabase -- db query --linked --project-ref nppvprbfmjbhwheghipa --file supabase/tests/lista_nominal_schema_preflight.sql
npm.cmd exec supabase -- db query --linked --project-ref nppvprbfmjbhwheghipa --file supabase/migrations/<generated>_lista_nominal_versionada.sql
```

Stop on any error and do not retry automatically.

- [ ] **Step 7: Run the database contract and verify GREEN**

Run the Step 2 command. Expected: the transactional contract completes and
rolls back without error.

- [ ] **Step 8: Commit the schema artifact and contracts**

```powershell
git add supabase/migrations/<generated>_lista_nominal_versionada.sql supabase/tests/lista_nominal_schema_preflight.sql supabase/tests/lista_nominal_schema.sql
git commit --only supabase/migrations/<generated>_lista_nominal_versionada.sql supabase/tests/lista_nominal_schema_preflight.sql supabase/tests/lista_nominal_schema.sql -m "feat: add versioned nominal-list schema"
```

### Task 3: Paquete idempotente y ejecución reanudable

**Files:**
- Create: `scripts/lista-nominal/sql-batches.mjs`
- Create: `scripts/lista-nominal/sql-batches.test.mjs`
- Create: `scripts/lista-nominal/supabase-cli.mjs`
- Create: `scripts/lista-nominal/supabase-cli.test.mjs`
- Create: `scripts/import-ine-lista-nominal.mjs`
- Create: `scripts/import-ine-lista-nominal.test.mjs`
- Modify: `.gitignore`
- Modify: `package.json`

**Interfaces:**
- Consumes: parser/profile from Task 1
- Produces: `prepareListaNominalImport(filePath, options) -> ImportPackage`
- Produces: `writeListaNominalArtifacts(prepared, outputDir) -> Manifest`
- Produces: `executeListaNominalManifest(manifest, options) -> ExecutionResult`
- Produces: explicit `--publish` mode that validates and changes only the selected cut from `VALIDADO` to `PUBLICADO`

- [ ] **Step 1: Write failing batch and CLI tests**

Assert deterministic SQL/checksums, `ON CONFLICT` identity by source hash, bounded section batches, no embedded credentials, rejection of every project ref except DEV, no automatic retry, resume by confirmed checksum, and rejection of `--publish` until the cut is complete and validated.

- [ ] **Step 2: Run tests and verify RED**

```powershell
node --test scripts/lista-nominal/sql-batches.test.mjs scripts/lista-nominal/supabase-cli.test.mjs scripts/import-ine-lista-nominal.test.mjs
```

Expected: FAIL because the import package is missing.

- [ ] **Step 3: Implement source and section batches**

Generate one cut batch plus deterministic section batches of at most 250 rows. SQL must preserve original source row, use explicit column lists, quote literals safely, and avoid updating a `PUBLICADO` cut.

- [ ] **Step 4: Implement the guarded one-shot executor**

Reuse the command shape already validated for demographics:

```text
npm.cmd exec supabase -- db query --linked --project-ref nppvprbfmjbhwheghipa --file <exact-batch.sql>
```

Stop on the first nonzero exit code. Persist only confirmed checksums using atomic rename.

- [ ] **Step 5: Add scripts and ignore generated artifacts**

Add `.artifacts/lista-nominal/` to `.gitignore` and these package commands:

```json
"lista-nominal:preflight": "node scripts/lista-nominal/profile.mjs",
"lista-nominal:import": "node scripts/import-ine-lista-nominal.mjs"
```

- [ ] **Step 6: Verify GREEN and generate a dry-run package**

```powershell
node --test scripts/lista-nominal/sql-batches.test.mjs scripts/lista-nominal/supabase-cli.test.mjs scripts/import-ine-lista-nominal.test.mjs
node scripts/import-ine-lista-nominal.mjs 'C:\Users\NZXT\Downloads\S.xlsx' --project-ref nppvprbfmjbhwheghipa --cartografia-version-id 4025
```

Expected: dry-run only, 7,191 planned section rows, no database write.

- [ ] **Step 7: Commit only Task 3 files**

```powershell
git add .gitignore package.json scripts/lista-nominal scripts/import-ine-lista-nominal.mjs scripts/import-ine-lista-nominal.test.mjs
git commit --only .gitignore package.json scripts/lista-nominal scripts/import-ine-lista-nominal.mjs scripts/import-ine-lista-nominal.test.mjs -m "feat: build resumable nominal-list imports"
```

### Task 4: Correspondencias exactas y controles de cobertura

**Files:**
- Create: `scripts/lista-nominal/crosswalk.mjs`
- Create: `scripts/lista-nominal/crosswalk.test.mjs`
- Create: `supabase/tests/lista_nominal_preflight.sql`
- Create: `supabase/tests/lista_nominal_postflight.sql`
- Modify: `scripts/import-ine-lista-nominal.mjs`

**Interfaces:**
- Consumes: imported cut/section IDs and cartography version 4025
- Produces: `buildListaNominalCrosswalkBatch({ sourceHash, cartographyVersionId })`
- Produces: preflight/postflight read-only contracts

- [ ] **Step 1: Write failing crosswalk tests**

Use a fixture where one number matches but municipality differs. Assert that generated SQL joins entity, municipality and section; creates one evaluation per source row/version; marks zero candidates `PENDIENTE`, one exact candidate `VINCULADA`, and multiple candidates `AMBIGUA`.

- [ ] **Step 2: Run and verify RED**

```powershell
node --test scripts/lista-nominal/crosswalk.test.mjs
```

- [ ] **Step 3: Implement crosswalk generation and append it to the manifest**

The batch must be idempotent and version-scoped. It must not modify cartography or stable territorial tables.

- [ ] **Step 4: Add read-only preflight/postflight contracts**

Preflight verifies project identity, migration prerequisites, cartography 4025 state/counts and absence/presence of the source hash. Postflight verifies:

```text
source rows=7191 linked=7001 pending=190 ambiguous=0
cartography without exact nominal row=51
padron=13407250 nominal=13206301 difference=200949
sections 696 and 6593 not linked in version 4025
```

- [ ] **Step 5: Verify GREEN and commit**

```powershell
node --test scripts/lista-nominal/crosswalk.test.mjs scripts/import-ine-lista-nominal.test.mjs
git add scripts/lista-nominal/crosswalk.mjs scripts/lista-nominal/crosswalk.test.mjs scripts/import-ine-lista-nominal.mjs supabase/tests/lista_nominal_preflight.sql supabase/tests/lista_nominal_postflight.sql
git commit --only scripts/lista-nominal/crosswalk.mjs scripts/lista-nominal/crosswalk.test.mjs scripts/import-ine-lista-nominal.mjs supabase/tests/lista_nominal_preflight.sql supabase/tests/lista_nominal_postflight.sql -m "feat: map nominal-list cuts to cartography"
```

### Task 5: RPC de lectura y ruta autenticada

**Files:**
- Create via CLI: `supabase/migrations/<generated>_lista_nominal_read_api.sql`
- Create: `supabase/tests/lista_nominal_read.sql`
- Create: `src/lib/lista-nominal-types.ts`
- Create: `src/lib/lista-nominal-versionada.ts`
- Create: `src/lib/lista-nominal-versionada.test.ts`
- Create: `src/lib/lista-nominal-http.ts`
- Create: `src/lib/lista-nominal-http.test.ts`
- Create: `src/lib/lista-nominal-server.ts`
- Create: `src/app/api/lista-nominal/secciones/[seccionId]/route.ts`
- Create: `src/app/api/lista-nominal/secciones/[seccionId]/route.test.ts`

**Interfaces:**
- Produces: `public.rpc_lista_nominal_seccion(bigint, bigint, date)`
- Produces: `public.rpc_lista_nominal_cobertura(bigint, bigint)`
- Produces: `getVersionedNominalList(invoke, input) -> ListaNominalSeccionResponse`
- Produces: authenticated `GET /api/lista-nominal/secciones/:seccionId?versionId=&cutoffDate=`

- [ ] **Step 1: Write failing SQL read tests**

Assert latest `PUBLICADO` cut selection, explicit historical cutoff selection, exact section/version identity, empty result for a missing link, coverage counts, `SECURITY INVOKER`, and execute privilege limited to `service_role`/owner.

- [ ] **Step 2: Verify SQL test RED before creating the RPC migration**

```powershell
npm.cmd exec supabase -- db query --linked --project-ref nppvprbfmjbhwheghipa --file supabase/tests/lista_nominal_read.sql
```

Expected: FAIL because the RPC does not exist.

- [ ] **Step 3: Create and implement the read migration**

```powershell
npm.cmd exec supabase -- migration new lista_nominal_read_api
```

Implement stable SQL RPCs with explicit return columns, blank `search_path`, version/state validation and no dynamic SQL.

- [ ] **Step 4: Inspect and apply only the read migration once in DEV**

Verify there is no `SECURITY DEFINER`, client grant or dynamic SQL, then run
the exact migration with `supabase db query`. Stop on error and do not retry.

- [ ] **Step 5: Run the SQL read contract and verify GREEN**

Run the Step 2 command. Expected: the transactional RPC contract completes
and rolls back without error.

- [ ] **Step 6: Write failing TypeScript boundary tests**

Assert positive integer parsing, ISO cutoff-date allowlisting, 401 before privileged-client creation, private/no-store responses, one fixed RPC name, strict response normalization, `UNAVAILABLE` on zero rows, and sanitized gateway errors.

- [ ] **Step 7: Verify TypeScript tests RED**

```powershell
node --import tsx --test src/lib/lista-nominal-versionada.test.ts src/lib/lista-nominal-http.test.ts "src/app/api/lista-nominal/secciones/[seccionId]/route.test.ts"
```

- [ ] **Step 8: Implement types, adapter, HTTP boundary, server invoker and route**

Use the same authenticated server-only pattern as demographics. Do not accept table names, RPC names, tokens or arbitrary filters from the browser.

- [ ] **Step 9: Verify GREEN and commit**

```powershell
node --import tsx --test src/lib/lista-nominal-versionada.test.ts src/lib/lista-nominal-http.test.ts "src/app/api/lista-nominal/secciones/[seccionId]/route.test.ts"
git add supabase/migrations/<generated>_lista_nominal_read_api.sql supabase/tests/lista_nominal_read.sql src/lib/lista-nominal-* "src/app/api/lista-nominal/secciones/[seccionId]"
git commit --only supabase/migrations/<generated>_lista_nominal_read_api.sql supabase/tests/lista_nominal_read.sql src/lib/lista-nominal-types.ts src/lib/lista-nominal-versionada.ts src/lib/lista-nominal-versionada.test.ts src/lib/lista-nominal-http.ts src/lib/lista-nominal-http.test.ts src/lib/lista-nominal-server.ts "src/app/api/lista-nominal/secciones/[seccionId]/route.ts" "src/app/api/lista-nominal/secciones/[seccionId]/route.test.ts" -m "feat: expose versioned nominal-list reads"
```

### Task 6: Presentación en el popup de sección

**Files:**
- Create: `src/lib/lista-nominal-client.ts`
- Create: `src/lib/lista-nominal-client.test.ts`
- Create: `src/components/analytics/ListaNominalSeccionCard.tsx`
- Create: `src/components/analytics/ListaNominalSeccionCard.test.tsx`
- Modify: `src/components/analytics/SeccionPopup.tsx`

**Interfaces:**
- Consumes: route and response type from Task 5
- Produces: `createListaNominalRequestCoordinator(...)`
- Produces: `<ListaNominalSeccionCard data={...} />`

- [ ] **Step 1: Write failing client and component tests**

Assert request-key isolation by section/version/cutoff, abort of stale responses, es-MX number formatting, cutoff date, padrón/lista/desglose/difference/coverage, and explicit unavailable rendering without zero substitution.

- [ ] **Step 2: Verify RED**

```powershell
node --import tsx --test src/lib/lista-nominal-client.test.ts src/components/analytics/ListaNominalSeccionCard.test.tsx
```

- [ ] **Step 3: Implement coordinator and card**

Keep nominal-list loading independent from demographics so either source can fail without hiding the other.

- [ ] **Step 4: Integrate into `SeccionPopup`**

Fetch by stable `seccionId` and selected `cartografiaVersionId`. Prefer the official published nominal total for the existing summary statistic when available; retain `detalle.lista_nominal` as a fallback. Clear stale data when section/version changes.

- [ ] **Step 5: Verify GREEN, typecheck and targeted lint**

```powershell
node --import tsx --test src/lib/lista-nominal-client.test.ts src/components/analytics/ListaNominalSeccionCard.test.tsx
& .\node_modules\.bin\tsc.cmd --noEmit
npm.cmd exec eslint -- src/lib/lista-nominal-client.ts src/components/analytics/ListaNominalSeccionCard.tsx src/components/analytics/SeccionPopup.tsx
```

- [ ] **Step 6: Commit only Task 6 files**

```powershell
git add src/lib/lista-nominal-client.ts src/lib/lista-nominal-client.test.ts src/components/analytics/ListaNominalSeccionCard.tsx src/components/analytics/ListaNominalSeccionCard.test.tsx src/components/analytics/SeccionPopup.tsx
git commit --only src/lib/lista-nominal-client.ts src/lib/lista-nominal-client.test.ts src/components/analytics/ListaNominalSeccionCard.tsx src/components/analytics/ListaNominalSeccionCard.test.tsx src/components/analytics/SeccionPopup.tsx -m "feat: show INE nominal list in section popup"
```

### Task 7: Carga única en SIPEEM-DEV y verificación integral

**Files:**
- Generated only, ignored: `.artifacts/lista-nominal/<source-hash>/*`
- Update only if evidence requires it: documentation commands in the spec/plan

**Interfaces:**
- Consumes: all prior tasks
- Produces: validated and published cut in SIPEEM-DEV only

- [ ] **Step 1: Confirm repository and linked project without changing data**

```powershell
npm.cmd exec supabase -- --version
Get-Content -LiteralPath supabase\.temp\project-ref
git status --short
```

Expected: CLI 2.118+ and project ref `nppvprbfmjbhwheghipa`.

- [ ] **Step 2: Confirm the two schema stages with read-only contracts**

Do not reapply either migration. Run the schema and RPC contracts to verify
that the reviewed definitions are already present in DEV:

```powershell
npm.cmd exec supabase -- db query --linked --project-ref nppvprbfmjbhwheghipa --file supabase/tests/lista_nominal_schema.sql
npm.cmd exec supabase -- db query --linked --project-ref nppvprbfmjbhwheghipa --file supabase/tests/lista_nominal_read.sql
```

- [ ] **Step 3: Run the data preflight once**

```powershell
npm.cmd exec supabase -- db query --linked --project-ref nppvprbfmjbhwheghipa --file supabase/tests/lista_nominal_preflight.sql
```

Stop on any mismatch. Do not retry automatically.

- [ ] **Step 4: Generate and inspect the dry-run package**

```powershell
node scripts/import-ine-lista-nominal.mjs 'C:\Users\NZXT\Downloads\S.xlsx' --project-ref nppvprbfmjbhwheghipa --cartografia-version-id 4025
```

Verify source hash, row ranges, checksums and that the manifest contains no credentials.

- [ ] **Step 5: Execute the approved manifest once**

```powershell
node scripts/import-ine-lista-nominal.mjs 'C:\Users\NZXT\Downloads\S.xlsx' --project-ref nppvprbfmjbhwheghipa --cartografia-version-id 4025 --apply
```

Execute sequentially without per-batch authorization prompts. Stop at the first failure, preserve confirmed checksums, and never retry automatically.

- [ ] **Step 6: Run postflight and publish in DEV**

Run `supabase/tests/lista_nominal_postflight.sql`. Publish only if every exact count and total matches the Review Focus values:

```powershell
node scripts/import-ine-lista-nominal.mjs 'C:\Users\NZXT\Downloads\S.xlsx' --project-ref nppvprbfmjbhwheghipa --cartografia-version-id 4025 --publish
```

The publish mode must execute one validated state-transition batch and no data
batch. Re-run postflight after publication to prove read visibility and
immutability.

- [ ] **Step 7: Run complete regression suite**

```powershell
node --test scripts/lista-nominal/*.test.mjs scripts/import-ine-lista-nominal.test.mjs scripts/demografia/*.test.mjs scripts/import-inegi-demografia.test.mjs
node --import tsx --test src/lib/lista-nominal-*.test.ts src/components/analytics/ListaNominalSeccionCard.test.tsx src/lib/demografia-*.test.ts src/components/analytics/DemografiaSeccionCard.test.tsx "src/app/api/lista-nominal/secciones/[seccionId]/route.test.ts" "src/app/api/demografia/secciones/[seccionId]/route.test.ts"
& .\node_modules\.bin\tsc.cmd --noEmit
npm.cmd run build
```

Report unrelated pre-existing lint failures separately; do not repair them in this scope.

- [ ] **Step 8: Validate the user flow locally**

Open `/mapa`, select cartography 4025, click one linked section and one section without exact nominal data. Verify click, zoom, pan, demographics and nominal-list cards together; verify no service key appears in network responses.

- [ ] **Step 9: Final repository audit**

```powershell
git status --short
git log --oneline -8
git diff --check HEAD~6..HEAD
```

Confirm no source XLSX, generated batches, state files or credentials are tracked. Do not deploy to Production.
