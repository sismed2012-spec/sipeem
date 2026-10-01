# Promoción territorial a Producción Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar el historial territorial de Supabase, promover de forma reanudable el esquema y los datos publicados de SIPEEM-DEV a SIPEEM-TERRITORIAL-PROD y validar un corte reversible de la aplicación.

**Architecture:** Un workdir Supabase dedicado contiene únicamente las 49 migraciones territoriales y sus pruebas. Un CLI Node.js, cerrado por política y gobernado por manifiesto/journal, ejecuta preflight, simulación, aplicación única, transferencia lógica y postflight; Vercel cambia primero en un Preview aislado y nunca antes de que la base destino quede verificada.

**Tech Stack:** Node.js ESM y `node:test`; Supabase CLI 2.119.0; PostgreSQL 17/PostGIS; Docker Desktop y `pg_dump`/`psql`; Git; Vercel CLI; Windows PowerShell.

**Spec:** `docs/superpowers/specs/2026-10-01-promocion-territorial-produccion-design.md`

## Global Constraints

- Fuente de sólo lectura durante la promoción: SIPEEM-DEV `nppvprbfmjbhwheghipa`.
- Único destino territorial escribible: SIPEEM-TERRITORIAL-PROD `cdvukcthosppezjscwod`.
- Destinos permanentemente prohibidos: SIPEEM `xvdqlozimvqluwxpbizx` y SIPEEM-PREVIEW `ljlfezcpckrmbrmucbva`.
- Ejecutar Supabase con `--workdir infra/territorial`; nunca depender de descubrimiento ascendente.
- Simulación es el modo predeterminado; cada escritura necesita manifiesto, journal y confirmación exacta de fase.
- No usar reintentos automáticos, `--include-seed`, reset remoto ni comandos construidos mediante shell.
- No copiar Auth, Storage, sesiones, datos operativos ni secretos.
- Secretos sólo desde Windows Credential Manager/proveedores y por `stdin` o entorno del proceso hijo; nunca en Git, argumentos, salida o archivos de evidencia.
- Toda tabla en esquema expuesto debe tener RLS y privilegios explícitos; exposición Data API y RLS se validan por separado.
- Revisar el impacto PostgreSQL 17.11 sobre `pgcrypto`, `btree_gist`, `ltree` y operadores personalizados.
- No modificar Vercel Production hasta que esquema, datos, seguridad y Preview estén verificados.
- En Windows usar `npm.cmd`; para TypeScript usar `& .\node_modules\.bin\tsc.cmd --noEmit`.
- Una pérdida de créditos, conectividad o estado concluyente produce `BLOCKED` o `FAILED_UNKNOWN`; nunca una repetición implícita.

## Review Focus

- Un prefijo engañoso, mayúsculas o espacios en un project ref deben ser rechazados; Task 2 prueba comparación exacta antes de construir comandos.
- Un proceso que termine después de escribir pero antes de guardar el journal debe reanudarse mediante sondas de lectura, no repitiendo la fase; Tasks 3, 5 y 7 prueban `FAILED_UNKNOWN`.
- Una tabla nueva o renombrada en el origen no debe entrar al dump por omisión; Task 6 prueba inventario cerrado y bloqueo por desconocidos.
- Una migración alterada después de crear el manifiesto debe invalidar tanto simulación como aplicación; Tasks 3 y 5 prueban hash individual y global.
- Salidas de CLI, errores y journals que contengan contraseñas, service keys o URLs con credenciales deben redactarse antes de persistir; Tasks 2, 3 y 8 prueban redacción.

---

### Task 1: Separar el workdir territorial sin cambiar SQL

**Files:**
- Create: `infra/territorial/supabase/config.toml`
- Move: `supabase/migrations/202609*.sql` → `infra/territorial/supabase/migrations/`
- Move: `supabase/tests/*.sql` → `infra/territorial/supabase/tests/`
- Create: `scripts/territorial-promotion/layout.mjs`
- Create: `scripts/territorial-promotion/layout.test.mjs`
- Modify: `.gitignore`
- Modify: `package.json`
- Modify: referencias de rutas bajo `scripts/**/*.mjs`, `scripts/**/*.test.mjs` y `docs/superpowers/plans/*.md`

**Interfaces:**
- Consumes: 19 migraciones operativas `001`–`019`, 49 migraciones territoriales `202609*.sql` y 18 pruebas SQL existentes.
- Produces: `inspectTerritorialLayout(rootDir): Promise<LayoutReport>` y script `territorial:layout:check`.

- [ ] **Step 1: Escribir el test rojo de separación**

`layout.test.mjs` debe crear un fixture y afirmar que `inspectTerritorialLayout()` exige exactamente: raíz operativa sin timestamps territoriales; workdir territorial sin migraciones `001`–`019`; 49 migraciones territoriales con nombre sin cambios; 18 pruebas SQL; `config.toml`; y ninguna ruta absoluta.

Run: `node --test scripts/territorial-promotion/layout.test.mjs`

Expected: FAIL porque `layout.mjs` no existe.

- [ ] **Step 2: Implementar `inspectTerritorialLayout()` y mover archivos**

Usar `git mv` para conservar historia. `config.toml` declarará `project_id = "sipeem-territorial"`, schemas `public` y `territorial_private`, y no definirá seeds. Añadir `/infra/territorial/journals/` y `/infra/territorial/artifacts/` a `.gitignore`.

- [ ] **Step 3: Actualizar rutas y scripts de validación**

Añadir:

```json
"territorial:layout:check": "node scripts/territorial-promotion/layout.mjs --check",
"territorial:test": "node --test scripts/territorial-promotion/*.test.mjs"
```

Actualizar referencias activas a migraciones/tests territoriales; conservar documentos históricos, pero añadir una nota de nueva ruta cuando contengan comandos ejecutables.

- [ ] **Step 4: Verificar contenido idéntico y pruebas existentes**

Run:

```powershell
npm.cmd run territorial:layout:check
node --test scripts/demografia/*.test.mjs scripts/lista-nominal/*.test.mjs scripts/import-ine*.test.mjs scripts/publish-inegi-eceg.test.mjs
git diff --check
```

Expected: layout PASS; pruebas Node PASS; sólo aparecen renames puros para los 67 SQL.

- [ ] **Step 5: Commit**

```powershell
git add .gitignore package.json infra/territorial scripts docs
git commit -m "refactor(db): isolate territorial Supabase workdir"
```

### Task 2: Política de proyectos, procesos y redacción de secretos

**Files:**
- Create: `scripts/territorial-promotion/policy.mjs`
- Create: `scripts/territorial-promotion/policy.test.mjs`
- Create: `scripts/territorial-promotion/process.mjs`
- Create: `scripts/territorial-promotion/process.test.mjs`

**Interfaces:**
- Consumes: project ref, fase solicitada y argumentos de herramienta.
- Produces: `SOURCE_PROJECT_REF`, `TARGET_PROJECT_REF`, `assertProjectRole()`, `assertSafeOperation()`, `buildSupabaseInvocation()`, `runProcessOnce()` y `redactSensitiveText()`.

- [ ] **Step 1: Escribir tests rojos de política**

Probar coincidencia exacta para fuente/destino; rechazo de ambos proyectos prohibidos y cualquier valor desconocido; rechazo de `reset`, `--include-seed`, `--db-url`, argumentos con contraseña/token y escritura sobre fuente; y aceptación de consultas de lectura en fuente y destino.

Run: `node --test scripts/territorial-promotion/policy.test.mjs`

Expected: FAIL por módulo inexistente.

- [ ] **Step 2: Implementar política cerrada**

Crear:

```js
assertProjectRole({ projectRef, role, access }): void
assertSafeOperation({ phase, projectRef, args }): void
buildSupabaseInvocation({ args, projectRef, workdir }): { command, args }
```

`buildSupabaseInvocation()` insertará `--workdir infra/territorial` y usará `npm.cmd`/npm CLI sin `shell`.

- [ ] **Step 3: Escribir tests rojos de proceso y redacción**

Probar salida exitosa/fallida, spawn error, ejecución exactamente una vez, `windowsHide: true`, `shell: false` y redacción de URL userinfo, `password=`, JWT, service keys y valores suministrados en `sensitiveValues`.

- [ ] **Step 4: Implementar `runProcessOnce()`**

Firma:

```js
runProcessOnce({ command, args, cwd, env, stdin, sensitiveValues }): Promise<ProcessResult>
```

Capturar salida limitada, conservar código de salida y devolver sólo texto redactado. No reintentar ni imprimir `env`/`stdin`.

- [ ] **Step 5: Verificar y commit**

Run: `node --test scripts/territorial-promotion/policy.test.mjs scripts/territorial-promotion/process.test.mjs`

Expected: PASS.

```powershell
git add scripts/territorial-promotion
git commit -m "feat(db): enforce territorial promotion policy"
```

### Task 3: Manifiesto inmutable y journal reanudable

**Files:**
- Create: `scripts/territorial-promotion/manifest.mjs`
- Create: `scripts/territorial-promotion/manifest.test.mjs`
- Create: `scripts/territorial-promotion/journal.mjs`
- Create: `scripts/territorial-promotion/journal.test.mjs`
- Create: `infra/territorial/manifests/production/.gitkeep`

**Interfaces:**
- Consumes: commit fuente, archivos territoriales, política de datos y expectativas verificables.
- Produces: `buildPromotionManifest()`, `validatePromotionManifest()`, `loadPromotionManifest()`, `createJournal()`, `transitionJournal()` y `saveJournalAtomically()`.

- [ ] **Step 1: Escribir tests rojos del manifiesto**

Fijar versión de contrato `1`; algoritmo `sha256`; rutas relativas normalizadas; migraciones ordenadas; hashes por archivo y global; source/target refs exactos; `sourceCommit`; expectativas 7,052/125/45/40/6,544/7,191; y ausencia de secretos. Alterar un byte, el orden, el commit o una ref debe fallar.

- [ ] **Step 2: Implementar el manifiesto mínimo**

Firmas:

```js
buildPromotionManifest(input): Promise<PromotionManifest>
validatePromotionManifest(manifest, { repoRoot, currentCommit }): Promise<void>
loadPromotionManifest(filePath, context): Promise<PromotionManifest>
```

El checksum global se calcula sobre JSON canónico sin el propio campo `manifestSha256`.

- [ ] **Step 3: Escribir tests rojos de estados y recuperación**

Probar la secuencia aprobada, transiciones inválidas, escritura atómica, journal de otro manifiesto/ref/commit, `BLOCKED`, `FAILED_CONFIRMED`, `FAILED_UNKNOWN` y requisito de sonda antes de salir de un estado desconocido.

- [ ] **Step 4: Implementar journal**

Firmas:

```js
createJournal({ manifestSha256, sourceCommit, sourceRef, targetRef }): Journal
transitionJournal(journal, { to, evidenceSha256, probeResolution }): Journal
saveJournalAtomically(filePath, journal): Promise<void>
```

Cada transición añadirá una entrada append-only; la vista `state` será la última entrada válida.

- [ ] **Step 5: Verificar y commit**

Run: `node --test scripts/territorial-promotion/manifest.test.mjs scripts/territorial-promotion/journal.test.mjs`

Expected: PASS.

```powershell
git add scripts/territorial-promotion infra/territorial/manifests
git commit -m "feat(db): add promotion manifest and journal"
```

### Task 4: Auditoría estática y preflight de sólo lectura

**Files:**
- Create: `scripts/territorial-promotion/migration-audit.mjs`
- Create: `scripts/territorial-promotion/migration-audit.test.mjs`
- Create: `scripts/territorial-promotion/preflight.mjs`
- Create: `scripts/territorial-promotion/preflight.test.mjs`
- Create: `infra/territorial/supabase/tests/promotion_preflight.sql`
- Create: `infra/territorial/supabase/tests/promotion_pg17_compatibility.sql`
- Create: `infra/territorial/security-exceptions.json`

**Interfaces:**
- Consumes: workdir, manifiesto, proyecto sondeado y excepciones revisadas.
- Produces: `auditMigrations()`, `parsePreflightReport()` y `runReadOnlyPreflight()` con resultado `PASSED | BLOCKED`.

- [ ] **Step 1: Escribir tests rojos de auditoría**

Probar detección de migración operativa, control transaccional anidado, `DROP ... CASCADE`, referencias a proyectos, `GRANT ... TO PUBLIC`, `SECURITY DEFINER` no inventariado y objeto fuera de `public`, `extensions` o `territorial_private`. Una excepción debe exigir firma, archivo, línea aproximada y justificación exactos.

- [ ] **Step 2: Implementar auditoría y excepciones iniciales**

`auditMigrations({ migrationDir, exceptions }): Promise<AuditReport>` no corrige SQL; reporta `errors` y `warnings`. Inventariar únicamente las funciones privilegiadas ya existentes y justificadas; cualquier aparición nueva bloquea.

- [ ] **Step 3: Escribir preflights SQL**

`promotion_preflight.sql` devolverá un único JSON con identidad de base, PG, región disponible, extensiones/versiones, tamaño, tablas públicas, historial y conteos. `promotion_pg17_compatibility.sql` comprobará índices `ltree`, `btree_gist` sobre float/NaN, cifrados legacy detectables y operadores con estimadores personalizados. Ambos deben ser sentencias de lectura.

- [ ] **Step 4: Implementar orquestador de preflight**

`runReadOnlyPreflight({ role, projectRef, manifest, dependencies }): Promise<PreflightResult>` ejecutará auditoría, Docker/`psql` health checks y las dos sondas SQL una vez. Para destino exigirá cero tablas de usuario e historial vacío antes de Fase 1; para fuente exigirá objetos territoriales y conteos del manifiesto.

- [ ] **Step 5: Verificar y commit**

Run: `node --test scripts/territorial-promotion/migration-audit.test.mjs scripts/territorial-promotion/preflight.test.mjs`

Expected: PASS, incluyendo Docker ausente → `BLOCKED` para datos pero no para simulación de esquema.

```powershell
git add scripts/territorial-promotion infra/territorial
git commit -m "feat(db): add territorial promotion preflight"
```

### Task 5: Plan y aplicación única del esquema

**Files:**
- Create: `scripts/territorial-promotion/schema.mjs`
- Create: `scripts/territorial-promotion/schema.test.mjs`
- Create: `infra/territorial/supabase/tests/promotion_schema_postflight.sql`

**Interfaces:**
- Consumes: política, manifiesto, journal y preflight de Tasks 2–4.
- Produces: `planSchemaPromotion()`, `applySchemaPromotionOnce()` y `probeSchemaState()`.

- [ ] **Step 1: Escribir tests rojos de planificación**

Probar que `planSchemaPromotion()` invoca `db push --dry-run --project-ref cdvukcthosppezjscwod --skip-vault`, usa el workdir territorial, compara las 49 migraciones en orden y no modifica el journal. Salida incompleta, extra o reordenada bloquea.

- [ ] **Step 2: Implementar plan de esquema**

Firma:

```js
planSchemaPromotion({ manifest, projectRef, dependencies }): Promise<SchemaPlan>
```

El resultado contendrá sólo migraciones, salida redactada, hash de evidencia y `matchesManifest`.

- [ ] **Step 3: Escribir tests rojos de aplicación/reanudación**

Probar que sólo `PREFLIGHT_PASSED` con plan coincidente puede escribir; se marca `SCHEMA_APPLYING` antes de spawn; éxito exige postflight; fallo conocido y pérdida de proceso quedan clasificados; reanudación consulta historial/objetos y jamás vuelve a llamar `db push` mientras el estado no esté resuelto.

- [ ] **Step 4: Implementar aplicación y postflight**

```js
applySchemaPromotionOnce({ manifest, journal, confirmation, dependencies }): Promise<Journal>
probeSchemaState({ projectRef, manifest, dependencies }): Promise<SchemaProbe>
```

`confirmation` debe ser exactamente `<manifestSha256>:SCHEMA_APPLY`. El postflight verificará 49 filas de historia, hashes locales, extensiones, objetos requeridos, RLS, permisos, funciones y ausencia de tablas `usuarios`, `roles`, `configuracion` y demás objetos operativos `001`–`019`.

- [ ] **Step 5: Verificar y commit**

Run: `node --test scripts/territorial-promotion/schema.test.mjs`

Expected: PASS sin conexión remota real.

```powershell
git add scripts/territorial-promotion infra/territorial/supabase/tests
git commit -m "feat(db): add one-shot territorial schema promotion"
```

### Task 6: Inventario cerrado, dump y restauración lógica

**Files:**
- Create: `scripts/territorial-promotion/data-policy.mjs`
- Create: `scripts/territorial-promotion/data-policy.test.mjs`
- Create: `scripts/territorial-promotion/database-transfer.mjs`
- Create: `scripts/territorial-promotion/database-transfer.test.mjs`
- Create: `infra/territorial/data-policy.json`
- Create: `infra/territorial/supabase/tests/promotion_data_inventory.sql`

**Interfaces:**
- Consumes: catálogo real de SIPEEM-DEV, manifiesto y esquema destino verificado.
- Produces: `classifySourceTables()`, `buildDumpPlan()`, `createDataArtifact()` y `restoreDataArtifactOnce()`.

- [ ] **Step 1: Escribir tests rojos de política de datos**

Probar clasificación exhaustiva de cada tabla `public` como `include` o `exclude`; bloquear duplicadas/desconocidas/faltantes; y excluir al menos `staging_electoral_registros`, `staging_electoral_resultados` y `staging_electoral_incidencias`. Una FK desde incluida hacia excluida debe bloquear hasta que la tabla padre se incluya o la dependencia se documente.

- [ ] **Step 2: Implementar inventario y completar política**

`promotion_data_inventory.sql` devolverá tablas, tamaños, filas estimadas, PK/FK, secuencias y dependencias. Ejecutar sólo la sonda de lectura contra DEV, clasificar todas las tablas observadas en `data-policy.json` y documentar la razón de cada exclusión. El test fijará ese inventario.

- [ ] **Step 3: Escribir tests rojos de dump**

Probar `db dump --data-only --use-copy --schema public`, una `--exclude` por tabla excluida, bloqueo sin Docker, archivo temporal, rename atómico, SHA-256/tamaño y ausencia de secretos. Simular tabla nueva debe impedir crear el dump.

- [ ] **Step 4: Implementar dump y restauración única**

Firmas:

```js
buildDumpPlan({ inventory, dataPolicy, artifactPath }): DumpPlan
createDataArtifact({ plan, manifest, dependencies }): Promise<DataArtifact>
restoreDataArtifactOnce({ artifact, manifest, journal, confirmation, dependencies }): Promise<Journal>
```

La restauración usará `psql --single-transaction --set ON_ERROR_STOP=on`; la contraseña llegará por entorno del hijo y el SQL por stdin/archivo, nunca en argumentos. `confirmation` será `<manifestSha256>:DATA_APPLY`. Guardar `DATA_APPLYING` antes de iniciar; cualquier interrupción queda `FAILED_UNKNOWN` hasta sonda.

- [ ] **Step 5: Verificar y commit**

Run: `node --test scripts/territorial-promotion/data-policy.test.mjs scripts/territorial-promotion/database-transfer.test.mjs`

Expected: PASS con fixtures; ninguna escritura remota.

```powershell
git add scripts/territorial-promotion infra/territorial
git commit -m "feat(db): add controlled territorial data transfer"
```

### Task 7: Postflight integral y CLI de fases

**Files:**
- Create: `scripts/territorial-promotion/verification.mjs`
- Create: `scripts/territorial-promotion/verification.test.mjs`
- Create: `scripts/territorial-promotion/cli.mjs`
- Create: `scripts/territorial-promotion/cli.test.mjs`
- Create: `infra/territorial/supabase/tests/promotion_postflight.sql`
- Modify: `package.json`

**Interfaces:**
- Consumes: módulos de Tasks 1–6.
- Produces: `verifyPromotion()`, `parsePromotionArgs()` y comandos `preflight`, `schema-plan`, `schema-apply`, `data-plan`, `data-apply`, `verify` y `status`.

- [ ] **Step 1: Escribir tests rojos del postflight**

Probar parsing de un reporte con 7,052 secciones, 125 municipios, 45 distritos locales, 40 federales, 6,544 ECEG y 7,191 nominales; hashes/estados de fuentes; geometrías/SRID; correspondencias; RPC; RLS/privilegios; asesores; y cero objetos operativos. Una diferencia produce `BLOCKED`, no tolerancia automática.

- [ ] **Step 2: Implementar SQL y verificador**

`promotion_postflight.sql` devolverá JSON de sólo lectura para todos los criterios. `verifyPromotion({ manifest, projectRef, dependencies })` comparará valores del manifiesto y producirá evidencia redactada; éxito transiciona `DATA_APPLIED → VERIFYING → VERIFIED`.

- [ ] **Step 3: Escribir tests rojos del CLI**

Probar default sin subcomando, flags desconocidos, ausencia de manifiesto, refs arbitrarias, confirmación incorrecta, `status` sin journal y cada subcomando con dependencias fake. Sólo `schema-apply` y `data-apply` pueden escribir; no existe subcomando `prod` ni retry.

- [ ] **Step 4: Implementar CLI y scripts npm**

Añadir:

```json
"territorial:promote": "node scripts/territorial-promotion/cli.mjs",
"territorial:verify": "node scripts/territorial-promotion/cli.mjs verify"
```

El CLI imprimirá JSON resumido y redactado; en `BLOCKED` devolverá código 2, fallo confirmado 1 y éxito 0.

- [ ] **Step 5: Ejecutar suite completa y commit**

Run:

```powershell
npm.cmd run territorial:layout:check
npm.cmd run territorial:test
node --test scripts/demografia/*.test.mjs scripts/lista-nominal/*.test.mjs scripts/import-ine*.test.mjs scripts/publish-inegi-eceg.test.mjs
& .\node_modules\.bin\tsc.cmd --noEmit
npm.cmd run lint
npm.cmd run build
```

Expected: todo PASS; `spawn EPERM` sólo se acepta como restricción local si el build remoto posterior queda `READY`.

```powershell
git add package.json scripts/territorial-promotion infra/territorial
git commit -m "feat(db): orchestrate territorial production promotion"
```

### Task 8: Congelar manifiesto y aplicar esquema en el destino

**Files:**
- Create: `infra/territorial/manifests/production/2026-10-01-sipeem-territorial-prod.json`
- Runtime only, ignored: `infra/territorial/journals/<manifest-sha>.json`
- Runtime only, ignored: `infra/territorial/artifacts/<manifest-sha>/`

**Interfaces:**
- Consumes: CLI verificado de Task 7 y credencial destino del almacén de Windows.
- Produces: manifiesto comprometido, journal `SCHEMA_APPLIED` y esquema territorial validado en `cdvukcthosppezjscwod`.

- [ ] **Step 1: Crear y revisar el manifiesto**

Con árbol limpio, tomar `sourceCommit = git rev-parse HEAD`, generar el manifiesto con las 49 migraciones, política completa y expectativas aprobadas. Ejecutar validación dos veces y confirmar salida idéntica.

- [ ] **Step 2: Commit del manifiesto**

```powershell
git add infra/territorial/manifests/production/2026-10-01-sipeem-territorial-prod.json
git commit -m "chore(db): freeze territorial production manifest"
```

El `sourceCommit` seguirá apuntando al commit padre que contiene todo el ejecutable; el promotor exige que sea ancestro de HEAD y que el árbol esté limpio.

- [ ] **Step 3: Ejecutar preflight y simulación de esquema**

Run:

```powershell
npm.cmd run territorial:promote -- preflight --manifest infra/territorial/manifests/production/2026-10-01-sipeem-territorial-prod.json
npm.cmd run territorial:promote -- schema-plan --manifest infra/territorial/manifests/production/2026-10-01-sipeem-territorial-prod.json
```

Expected: fuente/destino exactos, destino vacío, 49 migraciones en orden, hashes correctos; Docker puede seguir bloqueado sólo para datos.

- [ ] **Step 4: Aplicar una vez y ejecutar sólo postflight de esquema**

Usar el valor exacto `<manifestSha256>:SCHEMA_APPLY` mostrado por `schema-plan`:

```powershell
npm.cmd run territorial:promote -- schema-apply --manifest infra/territorial/manifests/production/2026-10-01-sipeem-territorial-prod.json --confirm <valor-exacto>
```

Expected: journal `SCHEMA_APPLIED`, 49 migraciones registradas, extensiones/objetos/permisos correctos y ausencia de tablas operativas. Ante error, detener y conservar estado; no repetir el comando.

- [ ] **Step 5: Conservar evidencia y revisar estado**

Run: `npm.cmd run territorial:promote -- status --manifest infra/territorial/manifests/production/2026-10-01-sipeem-territorial-prod.json`

Expected: evidencia redactada y siguiente acción `data-plan` o bloqueo explícito por Docker.

### Task 9: Transferir datos y verificar Producción territorial

**Files:**
- Runtime only: artefacto de dump y journal ignorados
- Verify: `infra/territorial/supabase/tests/promotion_postflight.sql`

**Interfaces:**
- Consumes: `SCHEMA_APPLIED`, Docker/psql saludables y manifiesto congelado.
- Produces: journal `VERIFIED` y base territorial completa; no modifica Vercel.

- [ ] **Step 1: Verificar herramientas sin reparación destructiva**

Run: `docker version` y `psql --version` mediante el preflight.

Expected: servidor Docker presente y cliente PostgreSQL 17 compatible. Si Docker Desktop falla, registrar `BLOCKED`; no resetear, reinstalar ni borrar datos automáticamente.

- [ ] **Step 2: Generar plan y artefacto de datos**

Run:

```powershell
npm.cmd run territorial:promote -- data-plan --manifest infra/territorial/manifests/production/2026-10-01-sipeem-territorial-prod.json
```

Expected: inventario coincide exactamente, staging excluido, dependencias cerradas, dump completado una vez y artefacto con SHA-256/tamaño sin secretos.

- [ ] **Step 3: Restaurar una sola vez**

Usar `<manifestSha256>:DATA_APPLY`:

```powershell
npm.cmd run territorial:promote -- data-apply --manifest infra/territorial/manifests/production/2026-10-01-sipeem-territorial-prod.json --confirm <valor-exacto>
```

Expected: `DATA_APPLIED`. Ante desconexión o salida indeterminada, detener en `FAILED_UNKNOWN` y ejecutar sólo `status`/sondas.

- [ ] **Step 4: Ejecutar postflight integral**

Run: `npm.cmd run territorial:verify -- --manifest infra/territorial/manifests/production/2026-10-01-sipeem-territorial-prod.json`

Expected: `VERIFIED`; conteos 7,052/125/45/40/6,544/7,191, fuentes/geom/RPC conciliados, asesores sin hallazgos críticos y ningún objeto operativo.

- [ ] **Step 5: Registrar resultado sin versionar secretos ni dump**

Run: `git status --short`

Expected: sólo archivos ignorados de runtime; ningún dump, journal, `.env` o secreto versionable.

### Task 10: Preview aislado, prueba de aceptación y preparación del corte

**Files:**
- Modify: `.env.local.example`
- Modify: `docs/arcgis-setup.md`
- Create: `docs/territorial-production-runbook.md`

**Interfaces:**
- Consumes: base destino `VERIFIED`, commit integrado y claves obtenidas en runtime.
- Produces: Preview `READY` apuntando a `cdvukcthosppezjscwod`, runbook de rollback y Production sin cambios.

- [ ] **Step 1: Escribir documentación/configuración sin secretos**

Añadir `CARTOGRAFIA_SUPABASE_URL` y `CARTOGRAFIA_SUPABASE_SERVICE_ROLE_KEY` como placeholders. El runbook debe indicar preflight, promoción, estados, recuperación `FAILED_UNKNOWN`, rotación, Preview y rollback de las dos variables.

- [ ] **Step 2: Validar la forma segura de variables branch-specific**

Run: `npm.cmd exec vercel -- env add --help`

Expected: confirmar soporte de `preview`, `--git-branch` y entrada por stdin. Si la CLI no lo soporta, detener: no usar `--env <secret>` ni reemplazar variables globales de Preview.

- [ ] **Step 3: Configurar sólo el branch Preview y desplegar**

Crear un branch Git temporal de Preview desde HEAD. Pasar URL y service key al CLI por stdin desde los proveedores, limitar ambas variables a ese branch y ejecutar `npm.cmd exec vercel -- --yes` sin `--prod`.

Expected: despliegue `READY`; Production y el resto de Previews conservan sus valores.

- [ ] **Step 4: Ejecutar aceptación autenticada**

Verificar login, mapa político, 125 municipios, sección, demografía, lista nominal, indicadores, distritos, zoom/arrastre, errores `Sin dato` y respuesta protegida de API. Comparar muestras con el postflight SQL.

Expected: historia completa PASS; cualquier error revierte/elimina sólo las variables branch-specific y no toca Production.

- [ ] **Step 5: Verificación final y commit documental**

Run:

```powershell
npm.cmd run territorial:test
& .\node_modules\.bin\tsc.cmd --noEmit
npm.cmd run lint
npm.cmd run build
git diff --check
git status --short
```

Expected: todo PASS y árbol sin secretos/artefactos.

```powershell
git add .env.local.example docs/arcgis-setup.md docs/territorial-production-runbook.md
git commit -m "docs: add territorial production runbook"
```

Detener aquí. La actualización de variables de **Vercel Production** y un despliegue `--prod` constituyen un corte independiente posterior a la aprobación del Preview; no forman parte de este plan.
