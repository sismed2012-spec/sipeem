# ECEG 2020 Demographics by Electoral Section Implementation Plan

> **Ruta histórica:** desde 2026-10-01, toda referencia ejecutable a
> `supabase/migrations` o `supabase/tests` en este plan se resuelve bajo
> `infra/territorial/supabase/` y el CLI se ejecuta con
> `--workdir infra/territorial`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Apply
> `superpowers:test-driven-development` to every behavior change and
> `superpowers:verification-before-completion` before claiming completion.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importar ECEG 2020 de INEGI a SIPEEM como fuente demográfica
seccional primaria, preservando el marco INE enero 2021 y publicando únicamente
correspondencias defendibles hacia cada versión cartográfica.

**Architecture:** Un importador Node perfila el XLSX oficial, normaliza sus 11
temas y genera lotes SQL deterministas. Supabase conserva filas seccionales de
origen y correspondencias versionadas; el RPC autenticado prefiere ECEG y usa
ITER solo como fallback explícito. Ningún total se reparte entre secciones
sucesoras sin equivalencia o recomputación defendible.

**Tech Stack:** Next.js 16, React 19, TypeScript, Node.js,
`@e965/xlsx@0.20.3`, Supabase CLI 2.118.0, PostgreSQL/PostGIS y Node test
runner.

**Spec:** `docs/superpowers/specs/2026-09-26-demografia-eceg-secciones-design.md`

## Global Constraints

- El único destino escribible es SIPEEM-DEV (`nppvprbfmjbhwheghipa`).
- El importador usa `--dry-run` por defecto; escribir exige `--apply` y el
  project ref exacto.
- No existe reintento automático. Los lotes confirmados se omiten por checksum.
- No usar `service_role` local ni imprimir secretos.
- El marco de origen es INE enero 2021 y debe aparecer en toda respuesta ECEG.
- No repartir población de una sección origen entre varias secciones destino.
- `*` y vacíos reservados son nulos, nunca cero.
- Tablas públicas nuevas: RLS activa y privilegios explícitos.
- Rutas Next.js: autenticadas y `private, no-store`.
- Preservar ITER y todos los cambios preexistentes.
- Leer `AGENTS.md` y la documentación local de Next.js antes de modificar rutas
  o componentes App Router.
- No aplicar migraciones o lotes hasta completar pruebas y preflight de lectura.
- No modificar PROD.

## Review Focus

1. Una hoja faltante, renombrada o con encabezado desplazado debe bloquear la
   carga antes de generar SQL.
2. Una sección repetida en cualquier tema debe bloquear la conciliación, no
   sobrescribir silenciosamente.
3. Una sección origen ausente en el destino debe permanecer una sola vez como
   `SIN_EQUIVALENCIA`; nunca duplicarse entre sucesoras.
4. Un corte interrumpido después de confirmar un lote debe reanudar en el lote
   siguiente sin ejecutar nuevamente el confirmado.
5. El RPC no debe mezclar indicadores ECEG con cobertura ITER en una misma
   respuesta.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `scripts/demografia/eceg-parser.mjs` | Create | Leer, validar y normalizar el XLSX ECEG |
| `scripts/demografia/eceg-parser.test.mjs` | Create | Contratos de hojas, claves, reservas y hashes |
| `scripts/demografia/eceg-profile.mjs` | Create | Preflight estatal y compatibilidad de claves |
| `scripts/demografia/eceg-sql-batches.mjs` | Create | Lotes deterministas de fuente, indicadores y secciones |
| `scripts/demografia/eceg-sql-batches.test.mjs` | Create | Idempotencia, rangos, checksums y reanudación |
| `scripts/import-inegi-eceg.mjs` | Create | CLI dry-run/apply limitado a DEV |
| `scripts/import-inegi-eceg.test.mjs` | Create | Contrato de CLI y no-reintento |
| `scripts/publish-inegi-eceg.mjs` | Create | Publicación atómica con doble guard DEV |
| `supabase/migrations/<timestamp>_create_demografia_eceg_model.sql` | Create | Filas ECEG y correspondencias versionadas |
| `supabase/migrations/<timestamp>_extend_demografia_eceg_read_api.sql` | Create | Lectura ECEG-first con fallback ITER |
| `supabase/migrations/<timestamp>_harden_demografia_eceg_publication.sql` | Create | Marco exacto e inmutabilidad después de publicar |
| `supabase/migrations/<timestamp>_close_demografia_eceg_concurrency_gaps.sql` | Create | Bloqueo compartido y protección contra reasignación |
| `supabase/tests/demografia_eceg.sql` | Create | Integridad, seguridad y precedencia de fuente |
| `src/lib/demografia-types.ts` | Modify | Metadatos de grano, marco y correspondencia |
| `src/lib/demografia-versionada.ts` | Modify | Normalización del RPC ampliado |
| `src/lib/demografia-versionada.test.ts` | Modify | Contrato ECEG-first y no mezcla |
| `src/app/api/demografia/secciones/[seccionId]/route.test.ts` | Modify | Autenticación y caché privada |
| `src/components/analytics/DemografiaSeccionCard.tsx` | Modify | Mostrar fuente, marco y advertencias ECEG |
| `src/components/analytics/DemografiaSeccionCard.test.tsx` | Modify | Casos ECEG, ITER y no disponible |

## Task 1: Parse and Profile the Official ECEG Workbook

**Interfaces:**
- Consumes: ZIP/XLSX oficial y `@e965/xlsx@0.20.3`.
- Produces: `readEcegWorkbook(path)`, `buildEcegProfile(workbook, entityCode)`
  y filas normalizadas por sección.

- [x] Escribir pruebas fallidas para las 11 hojas temáticas, encabezados en fila
  3, cinco descriptores geográficos, identidad entidad+sección, valores
  reservados, duplicados, hashes estables y ausencia de una hoja.
- [x] Ejecutar `node --test scripts/demografia/eceg-parser.test.mjs` y comprobar
  que falla por módulos ausentes.
- [x] Implementar el parser mínimo y la normalización de 220 indicadores.
- [x] Ejecutar la prueba hasta obtener PASS.
- [x] Ejecutar el preflight real y exigir: 6,544 secciones, 125 municipios, 41
  distritos, 16,992,418 habitantes y cero duplicados.
- [x] Confirmar que el preflight no contacta Supabase.
- [x] Commit: `feat: parse and profile INEGI ECEG demographics`.

## Task 2: Add the Canonical ECEG Schema

**Interfaces:**
- Consumes: filas normalizadas de Task 1 y tablas demográficas existentes.
- Produces: `demografia_eceg_secciones` y
  `demografia_eceg_correspondencias`.

- [x] Crear la migración con `npm.cmd exec supabase -- migration new
  create_demografia_eceg_model`.
- [x] Escribir primero el contrato SQL fallido para unicidad, checks, estados,
  claves foráneas, RLS y grants.
- [x] Implementar tablas, índices y extensiones de etapas de lote.
- [x] Probar transaccionalmente que una sección origen solo puede tener un
  destino automático y que `SIN_EQUIVALENCIA` no tiene destino.
- [x] Ejecutar la suite SQL sin publicar y obtener PASS.
- [x] Commit: `feat: add canonical ECEG demographic schema`.

## Task 3: Build Resumable ECEG Batches and Correspondences

**Interfaces:**
- Consumes: perfil de Task 1 y tablas de Task 2.
- Produces: manifiesto, SQL por lotes de 250 y ejecución protegida.

- [x] Escribir pruebas fallidas para SQL determinista, payload base64, checksum,
  reanudación, detención al primer fallo y rechazo de todo project ref distinto
  de DEV.
- [x] Implementar lotes de fuente, indicadores y 6,544 secciones.
- [x] Implementar vínculos `CLAVE_NUMERICA` como `VINCULO_HISTORICO` para una
  versión destino explícita y `SIN_MATCH` para el resto; reservar `DIRECTA`
  para equivalencia oficial o geométrica verificada.
- [x] Probar con fixtures que 1:N nunca genera varias publicaciones.
- [x] Ejecutar el dry-run real y conciliar 6,401 candidatas numéricas, 143 sin
  equivalencia, 651 destinos sin fuente y 1,800,168 habitantes pendientes.
- [x] Commit: `feat: import ECEG demographics with safe resume`.

## Task 4: Prefer ECEG in the Authenticated Read API

**Interfaces:**
- Consumes: correspondencias publicadas de Task 3 y agregados ITER existentes.
- Produces: respuesta unificada con `sourceGrain`, `sourceFrameDate`,
  `mappingMethod` y advertencias.

- [x] Crear migración con `npm.cmd exec supabase -- migration new
  extend_demografia_eceg_read_api`.
- [x] Escribir pruebas SQL/TypeScript fallidas para precedencia ECEG, fallback
  ITER, ausencia total y prohibición de mezclar fuentes.
- [x] Implementar RPC `SECURITY INVOKER`, `search_path` controlado y ejecución
  exclusiva para `service_role`.
- [x] Cambiar conteos de localidad del contrato a anulables cuando el grano es
  `SECCION`.
- [x] Ejecutar pruebas de RPC, ruta, tipos y `tsc --noEmit` hasta PASS.
- [x] Commit: `feat: serve versioned ECEG section demographics`.

## Task 5: Show Source Frame and Mapping Quality in the UI

**Interfaces:**
- Consumes: respuesta ampliada de Task 4.
- Produces: tarjeta demográfica con procedencia inequívoca.

- [x] Escribir pruebas de presentación para ECEG directa, fallback ITER,
  `SIN_EQUIVALENCIA`, valores nulos y cambio rápido de sección/versión.
- [x] Mostrar `INEGI ECEG 2020`, `Marco INE enero 2021`, método y advertencia
  antes de los indicadores.
- [x] Conservar AbortController/token de solicitud para impedir datos obsoletos.
- [x] Ejecutar pruebas enfocadas, typecheck, lint y build. El lint enfocado
  queda verde; el lint global conserva tres errores preexistentes fuera de este
  alcance (`analytics.ts` y dos componentes de historial). El build sí queda
  verde.
- [x] Commit: `feat: show ECEG provenance in section demographics`.

## Task 6: Controlled SIPEEM-DEV Rollout

**Interfaces:**
- Consumes: migraciones, manifiesto y suite verde de Tasks 1–5.
- Produces: fuente ECEG validada y publicada solo en SIPEEM-DEV.

- [x] Ejecutar gate local completo y `git diff --check`.
- [x] Repetir el preflight de solo lectura y verificar proyecto/version `4025`.
- [x] Aplicar las dos migraciones funcionales revisadas y la migración posterior
  de endurecimiento de invariantes únicamente a DEV.
- [x] Ejecutar una sola importación; detenerse al primer lote fallido sin retry.
- [x] Ejecutar correspondencias y postflight de solo lectura.
- [x] Verificar 6,544 fuente, 6,401 vínculos históricos, 143 sin equivalencia,
  suma estatal, reservas, RLS, grants y precedencia del RPC.
- [x] Verificar Preview con secciones directas, fallback y no disponibles.
- [x] Registrar hashes, lotes, commits y URL Preview. Declarar que PROD no cambió.

## Final Acceptance Checklist

- [x] Fuente oficial y hashes registrados.
- [x] 6,544 secciones y 220 indicadores cargados idempotentemente.
- [x] 16,992,418 habitantes conciliados.
- [x] 6,401 candidatas numéricas sin duplicación, identificadas como vínculo
  histórico y no como equivalencia geométrica.
- [x] 143 secciones origen y su población conservadas sin reparto.
- [x] 651 secciones destino muestran fallback explícito o no disponible.
- [x] La respuesta identifica conjunto, grano, marco y método.
- [x] Importación reanudable probada sin retry automático.
- [x] RLS y privilegios allow/deny verificados.
- [x] Tests, typecheck, lint, build y Preview verificados; el lint enfocado está
  limpio y los tres errores globales preexistentes quedan documentados en Task 5.
- [x] PROD no fue modificado.

## Rollout Record — SIPEEM-DEV

- Proyecto: `nppvprbfmjbhwheghipa`; versión cartográfica: `4025`.
- XLSX SHA-256:
  `8f409924e3f97fe4f839a8a9a2543d5d364c5ce161b87f9a322e5da4ee2bcc37`.
- ZIP SHA-256:
  `576c4821fcfd40a8b8a97c1c717b07d66ad07511bd7f81733edf0b28442b707b`.
- Migraciones exactas aplicadas: `20260927061605`, `20260927063836`,
  `20260927073000`, `20260927075500`.
- Lotes: 56/56 ejecutados; 55 lotes de datos confirmados y 0 defectuosos.
- Publicación atómica: fuente `11`, 6,544 correspondencias publicadas.
- Commits: `3806378`, `9cc321d`, `e5680f8`, `42aa444`, `c82370b`,
  `ae0019d`, `55723b7`, `f85ec36`.
- Preview `READY`:
  `https://sipeem-e9perep4f-leo-zarates-projects.vercel.app`.
- PROD no fue migrado, desplegado ni promovido.

## Pre-PR Hardening

- El publicador sólo funciona mediante `demografia:eceg:publish`, exige el ref
  exacto de SIPEEM-DEV y establece una marca transaccional que el propio SQL
  vuelve a validar. La ejecución directa del archivo SQL falla cerrada.
- Los lotes se envían siempre al ledger remoto; `run-state.json` es sólo un
  checkpoint auxiliar y nunca decide omitir trabajo.
- Una fuente ECEG `VALIDADA` o `PUBLICADA` y todos sus hijos quedan inmutables
  mediante triggers de base de datos.
- La publicación toma `FOR UPDATE` sobre la misma fuente que bloquean los lotes;
  los triggers validan tanto el propietario anterior como el nuevo para impedir
  reasignaciones desde o hacia una fuente inmutable.
- El marco `2021-01-31` se exige en fuente, filas, publicación y gateway.
