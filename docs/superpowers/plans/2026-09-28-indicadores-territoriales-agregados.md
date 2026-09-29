# Indicadores territoriales agregados Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exponer indicadores nominales y demográficos versionados por municipio y distrito, y mostrarlos como un modo temático reversible del mapa de SIPEEM.

**Architecture:** Una RPC `SECURITY INVOKER` normaliza cada fuente a una fila por sección y agrega contra las dimensiones de `cartografia_secciones`. Una ruta autenticada de Next.js transforma el resultado a un contrato TypeScript; helpers puros calculan identidad territorial, cuantiles y color, mientras el contenedor coordina solicitudes cancelables y el mapa sólo renderiza la presentación resultante.

**Tech Stack:** PostgreSQL/PostGIS y Supabase CLI; Next.js 16 App Router; TypeScript; React 19; Node test runner con `tsx`; SVG/GeoJSON; ArcGIS FeatureServer; Vercel Preview.

**Spec:** `docs/superpowers/specs/2026-09-28-indicadores-territoriales-agregados-design.md`

## Global Constraints

- Ejecutar y validar primero en SIPEEM-DEV `nppvprbfmjbhwheghipa`; no aplicar a PROD.
- Mantener el mapa político como modo predeterminado y restaurable.
- No sustituir datos faltantes por cero ni imputar valores parciales.
- No agregar `graproes` hasta disponer de un ponderador documentado.
- No crear tablas materializadas, refrescos ni índices sin evidencia de `EXPLAIN`.
- Usar `cartografia_seccion_id` y dimensiones versionadas; nunca unir por nombres.
- Mantener credenciales de `service_role` únicamente en módulos `server-only`.
- La RPC debe ser `stable`, `security invoker`, `search_path = ''` y ejecutable sólo por `service_role`.
- Leer `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` antes de modificar la ruta App Router.
- En Windows usar `npm.cmd` y `& .\node_modules\.bin\tsc.cmd --noEmit`.
- Cada escritura remota será única, sin reintento automático, precedida por preflight y seguida sólo por postflight de lectura.

## Review Focus

- Una respuesta tardía después de cambiar versión, nivel o métrica no debe reemplazar la selección vigente; Task 3 prueba cancelación y generaciones.
- Un cero observado y un valor ausente o reservado deben conservar estados diferentes; Tasks 1 y 2 prueban SQL y normalización.
- Dos claves territoriales permitidas pero contradictorias en la misma geometría deben producir `Sin dato`; Task 3 prueba resolución ambigua.
- Una fuente no publicada, de otra entidad, otro conjunto o sin correspondencia para la versión debe rechazarse; Task 1 prueba selección explícita y automática.
- Dos fuentes con datos para la misma sección no deben multiplicar filas ni totales; Task 1 reconcilia agregados con CTE separados por sección.

---

### Task 1: RPC agregada, contrato SQL y guardas de despliegue

**Files:**
- Create: `supabase/tests/territorial_indicators_read.sql`
- Create: `supabase/tests/territorial_indicators_preflight.sql`
- Create: `supabase/tests/territorial_indicators_postflight.sql`
- Create: `supabase/migrations/20260928170000_indicadores_territoriales_read_api.sql`

**Interfaces:**
- Consumes: `cartografia_versiones`, `cartografia_secciones`, `cartografia_municipios`, `cartografia_distritos_locales`, `cartografia_distritos_federales`, `lista_nominal_*`, `demografia_fuentes` y `demografia_eceg_*`.
- Produces: `public.rpc_indicadores_territoriales(text,bigint,bigint,bigint)` con una fila por territorio y las columnas tipadas de identidad, procedencia, cobertura, métricas electorales, métricas demográficas y `calidad_metricas jsonb`.

- [ ] **Step 1: Escribir el test SQL contractual que falla**

En `territorial_indicators_read.sql`, abrir transacción y afirmar:

- la firma exacta existe, es `STABLE`, `SECURITY INVOKER`, tiene `search_path=""`, niega `EXECUTE` a `PUBLIC`, `anon` y `authenticated`, y lo concede a `service_role`;
- `MUNICIPIO`, `DISTRITO_LOCAL` y `DISTRITO_FEDERAL` devuelven una identidad única por dimensión;
- nivel inválido, versión incompatible y fuentes no publicadas generan error;
- la selección nula escoge el corte y fuente publicados compatibles más recientes;
- dos secciones de fixture, una con ambas fuentes y otra sólo cartográfica, producen cobertura `1/2`, suma observada correcta, nulos honestos y cero sin confundirse;
- las filas nominal y ECEG de una misma sección se agregan una vez y no forman un producto cartesiano;
- la transacción termina con `rollback`.

- [ ] **Step 2: Ejecutar el test y comprobar la falla roja**

Run: `npm.cmd exec supabase -- test db supabase/tests/territorial_indicators_read.sql`

Expected: FAIL indicando que falta `public.rpc_indicadores_territoriales(text,bigint,bigint,bigint)`.

- [ ] **Step 3: Implementar la migración mínima**

Encerrar la migración completa en una sola transacción y crear la función con parámetros:

```sql
p_nivel text,
p_cartografia_version_id bigint,
p_lista_nominal_corte_id bigint default null,
p_demografia_fuente_id bigint default null
```

La tabla devuelta tendrá estas columnas exactas:

```text
nivel, territorio_id, cartografia_territorio_id, clave, nombre,
cartografia_version_id,
lista_nominal_corte_id, lista_nominal_fecha_corte,
demografia_fuente_id, demografia_anio_censal,
secciones_total, secciones_nominal, secciones_demografia,
cobertura_fuente_nominal_pct, cobertura_fuente_demografia_pct,
padron_hombres, padron_mujeres, padron_no_binario, padron_total,
lista_hombres, lista_mujeres, lista_no_binario, lista_total,
diferencia, cobertura_padron_pct,
pobtot, pobfem, pobmas, pob0_14, pob15_64, pob65_mas, p_18ymas,
pea, pocupada, p15ym_an, pder_ss, pcon_disc, p3ym_hli, pob_afro,
tvivhab, vph_aguadv, vph_drenaj, vph_c_elec, vph_cel, vph_pc,
vph_inter, calidad_metricas
```

La consulta debe usar CTE independientes `selected_version`, `selected_cut`, `selected_source`, `nominal_by_section`, `demography_by_section`, `section_facts` y una agregación final por el nivel validado. `cartografia_secciones` será la tabla conductora. Sólo entran nominales `VINCULADA` y demografía `VINCULO_HISTORICO` o `DIRECTA` con `publicada_at is not null`.

`cobertura_fuente_nominal_pct` y `cobertura_fuente_demografia_pct` miden secciones cubiertas sobre `secciones_total`; `cobertura_padron_pct` mide `sum(lista_total) * 100 / sum(padron_total)`. El objeto `calidad_metricas` contiene el conteo no nulo de cada indicador demográfico. Revocar y conceder permisos según Global Constraints.

- [ ] **Step 4: Añadir preflight y postflight de sólo lectura**

`territorial_indicators_preflight.sql` debe comprobar proyecto mediante `current_database()`, tablas y columnas dependientes, estados publicados compatibles e índices ya requeridos. Debe devolver `PENDIENTE` si la firma no existe, `YA_APLICADA_COMPATIBLE` si existe con definición, permisos y firma exactos, y fallar si detecta una definición divergente. No escribe ni inicia publicación.

`territorial_indicators_postflight.sql` debe comprobar firma, permisos, conteos territoriales derivados de la versión activa, unicidad, reconciliación de sumas y procedencia. Ejecutará cada nivel una vez para calentar y una segunda vez para medir, informará los milisegundos y fallará si la segunda ejecución excede 500 ms. También capturará `EXPLAIN (ANALYZE, FORMAT JSON)` de cada invocación para conservar el plan y tiempo observados; no crea fixtures ni modifica datos.

- [ ] **Step 5: Ejecutar el test SQL y verificar verde**

Run: `npm.cmd exec supabase -- test db supabase/tests/territorial_indicators_read.sql`

Expected: PASS y rollback completo del fixture.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260928170000_indicadores_territoriales_read_api.sql supabase/tests/territorial_indicators_*.sql
git commit -m "feat(db): add versioned territorial indicators RPC"
```

### Task 2: Dominio TypeScript y ruta autenticada

**Files:**
- Create: `src/lib/territorial-indicators-types.ts`
- Create: `src/lib/territorial-indicators-versioned.ts`
- Create: `src/lib/territorial-indicators-versioned.test.ts`
- Create: `src/lib/territorial-indicators-server.ts`
- Create: `src/lib/territorial-indicators-http.ts`
- Create: `src/lib/territorial-indicators-http.test.ts`
- Create: `src/app/api/indicadores-territoriales/route.ts`
- Create: `src/app/api/indicadores-territoriales/route.test.ts`

**Interfaces:**
- Consumes: RPC de Task 1 y `getDemografiaSupabaseConfig()`.
- Produces: `TerritorialLevel`, `TerritorialMetricKey`, `TerritorialIndicatorRow`, `TerritorialIndicatorsResponse`, `parseTerritorialIndicatorParams()`, `getTerritorialIndicators()` y `GET /api/indicadores-territoriales`.

- [ ] **Step 1: Leer la guía local de Route Handlers**

Run: `Get-Content node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md -Raw`

Expected: confirmar firma `GET(request: Request)` y control explícito de caché para Next.js 16.

- [ ] **Step 2: Escribir tests fallidos del contrato de dominio**

Probar en `territorial-indicators-versioned.test.ts`:

- sólo acepta los tres niveles exactos y `versionId` entero positivo;
- `nominalCutId` y `demographySourceId` son opcionales pero, si existen, son enteros positivos;
- parámetros adicionales como `rpc` o `token` se ignoran y nunca llegan al invocador;
- una colección no-array, identidad inválida, duplicado territorial, número negativo o `NaN` dispara `TerritorialIndicatorsGatewayError`;
- cero permanece cero y un SQL `null` permanece `null`;
- filas con diferente procedencia dentro de la misma respuesta se rechazan.

Run: `node --import tsx --test src/lib/territorial-indicators-versioned.test.ts`

Expected: FAIL por módulos inexistentes.

- [ ] **Step 3: Definir los tipos y el normalizador mínimo**

`TerritorialIndicatorRow` tendrá `level`, `territoryId`, `cartographyTerritoryId`, `key`, `name`, `totalSections`, `nominalSections`, `demographicSections`, `nominalSourceCoveragePercent`, `demographicSourceCoveragePercent`, `metricQuality` y `metrics`.

`metrics` contendrá nombres camelCase para todos los campos especificados, incluido `padronCoveragePercent`; cada demográfico será `number | null`. `TerritorialIndicatorsResponse` agrupará `level`, `versionId`, `nominalSource`, `demographicSource` y `rows`.

Crear:

```ts
parseTerritorialIndicatorParams(params: URLSearchParams): TerritorialIndicatorsInput
getTerritorialIndicators(invoke: TerritorialIndicatorsRpcInvoker, input: TerritorialIndicatorsInput): Promise<TerritorialIndicatorsResponse>
```

- [ ] **Step 4: Escribir tests fallidos de autenticación y ruta**

Probar que la ruta:

- responde `401` antes de crear el cliente privilegiado;
- responde `Cache-Control: private, no-store`;
- pasa sólo `p_nivel`, `p_cartografia_version_id`, `p_lista_nominal_corte_id` y `p_demografia_fuente_id`;
- mapea entrada inválida a `400`, fallo RPC a `502` y error desconocido a `500` sin filtrar el mensaje interno.

Run: `node --import tsx --test src/lib/territorial-indicators-http.test.ts src/app/api/indicadores-territoriales/route.test.ts`

Expected: FAIL por ruta y adaptadores inexistentes.

- [ ] **Step 5: Implementar invocador, wrapper HTTP y Route Handler**

Crear `createTerritorialIndicatorsServiceInvoker()` como módulo `server-only`, con cliente Supabase sin persistencia ni refresh. Crear `runAuthenticatedTerritorialIndicatorsRequest()` y `createTerritorialIndicatorsRoute()` siguiendo el patrón nominal existente. La ruta exportará `dynamic = "force-dynamic"`, `runtime = "nodejs"` y autenticará con `getUsuarioActual`.

- [ ] **Step 6: Ejecutar pruebas y tipos**

Run:

```powershell
node --import tsx --test src/lib/territorial-indicators-versioned.test.ts src/lib/territorial-indicators-http.test.ts src/app/api/indicadores-territoriales/route.test.ts
& .\node_modules\.bin\tsc.cmd --noEmit
```

Expected: todas PASS y TypeScript sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/lib/territorial-indicators-* src/app/api/indicadores-territoriales
git commit -m "feat(api): expose authenticated territorial indicators"
```

### Task 3: Coordinador cliente, claves territoriales y escala cuantílica

**Files:**
- Create: `src/lib/territorial-indicators-client.ts`
- Create: `src/lib/territorial-indicators-client.test.ts`
- Create: `src/lib/territorial-indicators-map.ts`
- Create: `src/lib/territorial-indicators-map.test.ts`

**Interfaces:**
- Consumes: tipos de Task 2 y propiedades GeoJSON existentes.
- Produces: `buildTerritorialIndicatorsUrl()`, `createTerritorialIndicatorsRequestCoordinator()`, `buildTerritorialIndicatorIndex()`, `resolveTerritoryIndicator()`, `buildQuantileScale()`, `getIndicatorFill()` y `formatTerritorialMetric()`.

- [ ] **Step 1: Escribir tests fallidos del cliente cancelable**

Probar que la URL incluye nivel, versión e IDs opcionales sin admitir campos arbitrarios; que cambiar versión o nivel aborta el `AbortController`; que una respuesta A tardía no sustituye B; y que `clear()` invalida el trabajo pendiente.

Run: `node --import tsx --test src/lib/territorial-indicators-client.test.ts`

Expected: FAIL por módulo inexistente.

- [ ] **Step 2: Implementar URL y coordinador por generación**

Crear:

```ts
buildTerritorialIndicatorsUrl(input: TerritorialIndicatorsInput): string
createTerritorialIndicatorsRequestCoordinator(fetcher, onValue, onError)
```

Usar la misma semántica de generación y cancelación que lista nominal, pero con clave `level:versionId:nominalCutId|latest:demographySourceId|latest`.

- [ ] **Step 3: Escribir tests fallidos de identidad y escala**

Probar:

- índice dual por `cartographyTerritoryId` y `key`;
- municipio por `cartografia_municipio_id`, `CVE_MUN` o últimos tres dígitos de `CVEGEO`;
- distrito local por `cartografia_distrito_local_id`, `DISTRITO_L`, `CVE_DTO_LOC`, `DTO_LOC` o `DISTRITO`;
- distrito federal por su ID versionado, `DISTRITO_F`, `CVE_DTO_FED`, `DTO_FED` o `DISTRITO`;
- dos campos presentes con números contradictorios devuelven `null`;
- cinco cuantiles ignoran nulos, reducen intervalos ante empates, y todos los nulos producen sólo `Sin dato`;
- cero recibe color válido; `null` recibe `#94a3b8`;
- formato `es-MX` distingue conteos y porcentajes.

Run: `node --import tsx --test src/lib/territorial-indicators-map.test.ts`

Expected: FAIL por módulo inexistente.

- [ ] **Step 4: Implementar helpers puros**

Usar paleta secuencial fija `#eff6ff`, `#bfdbfe`, `#60a5fa`, `#2563eb`, `#1e3a8a`. Normalizar claves municipales a tres dígitos y distritos a entero canónico. Si dos campos permitidos discrepan, rechazar la geometría; nunca resolver por nombre.

- [ ] **Step 5: Ejecutar pruebas y tipos**

Run:

```powershell
node --import tsx --test src/lib/territorial-indicators-client.test.ts src/lib/territorial-indicators-map.test.ts
& .\node_modules\.bin\tsc.cmd --noEmit
```

Expected: todas PASS y TypeScript limpio.

- [ ] **Step 6: Commit**

```bash
git add src/lib/territorial-indicators-client* src/lib/territorial-indicators-map*
git commit -m "feat(map): add territorial choropleth model"
```

### Task 4: Controles, leyenda y resumen temático presentacionales

**Files:**
- Create: `src/components/analytics/TerritorialIndicatorPanel.tsx`
- Create: `src/components/analytics/TerritorialIndicatorPanel.test.tsx`
- Create: `src/components/analytics/TerritorialIndicatorLegend.tsx`
- Create: `src/components/analytics/TerritorialIndicatorLegend.test.tsx`
- Create: `src/components/analytics/TerritorialIndicatorSummary.tsx`
- Create: `src/components/analytics/TerritorialIndicatorSummary.test.tsx`
- Modify: `src/components/analytics/LayerPanel.tsx:22-112`
- Modify: `src/components/analytics/LayerPanel.test.tsx`

**Interfaces:**
- Consumes: tipos, catálogo de métricas, escala y formateadores de Tasks 2–3.
- Produces: controles controlados por props, leyenda accesible, resumen para popup y slot `indicatorControls?: ReactNode` en `LayerPanel`.

- [ ] **Step 1: Escribir tests de render fallidos**

Con `renderToStaticMarkup`, afirmar:

- el panel ofrece `Mapa político` y `Indicador territorial`, los tres niveles y nueve métricas iniciales;
- corte nominal, año demográfico, cargando, error y reintento manual se muestran explícitamente;
- la leyenda renderiza intervalos, `Sin dato` y advertencia de no imputación;
- el resumen muestra valor, fuente y `secciones cubiertas / total` para ambas fuentes;
- cero se imprime como `0`, mientras `null` se imprime como `Sin dato`;
- `LayerPanel` conserva la leyenda operativa de compromisos y monta el slot temático por separado.

Run: `node --import tsx --test src/components/analytics/TerritorialIndicatorPanel.test.tsx src/components/analytics/TerritorialIndicatorLegend.test.tsx src/components/analytics/TerritorialIndicatorSummary.test.tsx src/components/analytics/LayerPanel.test.tsx`

Expected: FAIL por componentes y prop inexistentes.

- [ ] **Step 2: Implementar los componentes controlados**

No realizar `fetch` dentro de los componentes. El panel emitirá cambios mediante `onModeChange`, `onLevelChange`, `onMetricChange` y `onRetry`; deshabilitará selectores cuando no haya versión o mientras cambie la selección. La leyenda recibirá una escala ya calculada. El resumen recibirá una sola fila y la métrica activa.

- [ ] **Step 3: Ejecutar pruebas y tipos**

Run:

```powershell
node --import tsx --test src/components/analytics/TerritorialIndicatorPanel.test.tsx src/components/analytics/TerritorialIndicatorLegend.test.tsx src/components/analytics/TerritorialIndicatorSummary.test.tsx src/components/analytics/LayerPanel.test.tsx
& .\node_modules\.bin\tsc.cmd --noEmit
```

Expected: todas PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/analytics/TerritorialIndicator* src/components/analytics/LayerPanel*
git commit -m "feat(ui): add territorial indicator controls"
```

### Task 5: Coordinación temática en ElectoralMapContainer

**Files:**
- Modify: `src/components/analytics/ElectoralMapContainer.tsx:64-335,500-609`
- Modify: `src/components/analytics/ElectoralMapContainer.wiring.test.ts`

**Interfaces:**
- Consumes: coordinador de Task 3 y componentes de Task 4.
- Produces: `TerritorialThemePresentation | null` para el mapa, carga garantizada del overlay de distrito activo y estados de carga/error/reintento.

- [ ] **Step 1: Ampliar primero el test de wiring**

El test debe afirmar en el source que:

- el modo inicial es `POLITICAL`;
- el coordinador sólo consulta cuando hay modo temático y versión;
- cada cambio de versión o nivel limpia la presentación anterior;
- `DISTRITO_LOCAL` garantiza overlay `distrito_local` y `DISTRITO_FEDERAL` garantiza `distrito_federal`;
- error de la API deja `thematicPresentation` en `null` y expone reintento manual;
- `MapLegend` político se oculta cuando existe presentación temática;
- el panel se monta tanto en escritorio como en diálogo móvil;
- el mapa recibe `territorialTheme` sin reemplazar `coberturaMap`.

Run: `node --import tsx --test src/components/analytics/ElectoralMapContainer.wiring.test.ts`

Expected: FAIL por wiring inexistente.

- [ ] **Step 2: Implementar estado y carga temática**

Mantener en el contenedor `mode`, `level`, `metricKey`, `response`, `loading`, `error` y `retryKey`. Instanciar una vez el coordinador cancelable y limpiarlo en unmount o al volver a modo político. Refactorizar la carga ArcGIS no seccional a `ensureOverlay(key)` para que selección manual y nivel temático compartan una sola solicitud.

- [ ] **Step 3: Construir y pasar la presentación**

Derivar con `useMemo` el índice y la escala. En error o sin datos, pasar `null` para conservar colores políticos. Pasar controles a ambos `LayerPanel`, reemplazar visualmente `MapLegend` por `TerritorialIndicatorLegend` sólo en modo temático con datos y mantener el selector cartográfico.

- [ ] **Step 4: Ejecutar pruebas y tipos**

Run:

```powershell
node --import tsx --test src/components/analytics/ElectoralMapContainer.wiring.test.ts src/lib/territorial-indicators-client.test.ts
& .\node_modules\.bin\tsc.cmd --noEmit
```

Expected: todas PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/analytics/ElectoralMapContainer.tsx src/components/analytics/ElectoralMapContainer.wiring.test.ts
git commit -m "feat(map): coordinate territorial indicator mode"
```

### Task 6: Pintado territorial, clics y popups

**Files:**
- Create: `src/components/analytics/TerritorialIndicatorPopup.tsx`
- Create: `src/components/analytics/TerritorialIndicatorPopup.test.tsx`
- Modify: `src/components/analytics/EdomexInteractiveMap.tsx:21-625`
- Modify: `src/components/analytics/MunicipioPopup.tsx:16-175`
- Create: `src/components/analytics/EdomexInteractiveMap.wiring.test.ts`

**Interfaces:**
- Consumes: `TerritorialThemePresentation`, resolvers/colores de Task 3 y `TerritorialIndicatorSummary` de Task 4.
- Produces: coropleta por municipio o distrito, selección territorial temática y popup con procedencia/cobertura.

- [ ] **Step 1: Escribir tests fallidos de render y wiring**

Probar que:

- municipio temático usa color del indicador; sin presentación conserva `partido_color`;
- nivel distrito neutraliza la base municipal y sólo rellena el overlay correspondiente;
- overlays se ordenan con distrito antes y sección al final, manteniendo sección clicable;
- distrito temático detiene propagación y respeta `isDraggingRef`;
- identidad ambigua o valor nulo produce gris `#94a3b8` y etiqueta `Sin dato`;
- `MunicipioPopup` añade resumen sólo cuando recibe fila temática;
- `TerritorialIndicatorPopup` muestra distrito, indicador, procedencia y ambas coberturas.

Run: `node --import tsx --test src/components/analytics/EdomexInteractiveMap.wiring.test.ts src/components/analytics/TerritorialIndicatorPopup.test.tsx src/components/analytics/TerritorialIndicatorSummary.test.tsx`

Expected: FAIL por props y componente inexistentes.

- [ ] **Step 2: Implementar coropleta municipal y neutralización**

Añadir prop `territorialTheme`. Para `MUNICIPIO`, resolver cada feature base y usar `getIndicatorFill`; para distrito, rellenar base con `#e2e8f0`. Si la presentación es nula, ejecutar sin cambios la lógica política existente.

- [ ] **Step 3: Implementar overlay y popup de distrito**

Ordenar overlays explícitamente: distrito temático, demás límites y sección al final. Sólo el overlay del nivel temático tendrá relleno y `pointer-events`; los demás conservarán línea discontinua. Al hacer clic válido, seleccionar la fila resuelta, detener propagación y abrir `TerritorialIndicatorPopup`.

- [ ] **Step 4: Integrar resumen municipal y limpieza de selección**

Pasar fila y métrica activas a `MunicipioPopup`. Limpiar popup de distrito cuando cambien nivel, versión o modo; no limpiar el municipio seleccionado por activar/desactivar la temática.

- [ ] **Step 5: Ejecutar pruebas, regresiones y tipos**

Run:

```powershell
node --import tsx --test src/components/analytics/EdomexInteractiveMap.wiring.test.ts src/components/analytics/TerritorialIndicatorPopup.test.tsx src/components/analytics/TerritorialIndicatorSummary.test.tsx src/components/analytics/map-popup-resolvers.test.ts src/components/analytics/ElectoralMapContainer.wiring.test.ts
& .\node_modules\.bin\tsc.cmd --noEmit
```

Expected: todas PASS; clic de sección, identidad de municipio y tipos sin regresión.

- [ ] **Step 6: Commit**

```bash
git add src/components/analytics/EdomexInteractiveMap* src/components/analytics/MunicipioPopup.tsx src/components/analytics/TerritorialIndicatorPopup*
git commit -m "feat(map): render territorial indicator choropleths"
```

### Task 7: Verificación integral, aplicación única en DEV y Preview

**Files:**
- Verify: todos los archivos de Tasks 1–6
- Optional update only if findings require it: `docs/superpowers/specs/2026-09-28-indicadores-territoriales-agregados-design.md`

**Interfaces:**
- Consumes: sistema completo de Tasks 1–6.
- Produces: evidencia de pruebas locales, RPC aplicada una vez en SIPEEM-DEV, postflight de lectura y Preview verificable; no toca PROD.

- [ ] **Step 1: Ejecutar la suite focal completa**

Run:

```powershell
npm.cmd exec supabase -- test db supabase/tests/territorial_indicators_read.sql
node --import tsx --test src/lib/territorial-indicators-*.test.ts src/components/analytics/TerritorialIndicator*.test.tsx src/components/analytics/EdomexInteractiveMap.wiring.test.ts src/components/analytics/ElectoralMapContainer.wiring.test.ts src/components/analytics/LayerPanel.test.tsx src/components/analytics/map-popup-resolvers.test.ts
& .\node_modules\.bin\tsc.cmd --noEmit
npm.cmd run lint
npm.cmd run build
```

Expected: SQL y Node tests PASS, TypeScript limpio, lint sin errores y build exitoso. Si el sandbox devuelve `spawn EPERM`, repetir únicamente build fuera del sandbox autorizado y conservar el resultado remoto como confirmación adicional.

- [ ] **Step 2: Ejecutar preflight remoto de sólo lectura**

Run:

```powershell
npm.cmd exec supabase -- db query --linked --project-ref nppvprbfmjbhwheghipa --file supabase/tests/territorial_indicators_preflight.sql
```

Expected: todas las dependencias y fuentes compatibles presentes, ninguna escritura y estado `PENDIENTE` o `YA_APLICADA_COMPATIBLE`.

- [ ] **Step 3: Aplicar exactamente una vez la migración en SIPEEM-DEV**

Run:

```powershell
npm.cmd exec supabase -- db query --linked --project-ref nppvprbfmjbhwheghipa --file supabase/migrations/20260928170000_indicadores_territoriales_read_api.sql
```

Ejecutar este paso sólo si el preflight devolvió `PENDIENTE`. Si devolvió `YA_APLICADA_COMPATIBLE`, omitir la escritura y continuar directamente al postflight; esto permite reanudar con seguridad si una sesión anterior terminó después del commit remoto.

Expected: exit code 0. No reintentar automáticamente ante error; detenerse con el mensaje y estado exactos.

- [ ] **Step 4: Ejecutar sólo el postflight remoto de lectura**

Run:

```powershell
npm.cmd exec supabase -- db query --linked --project-ref nppvprbfmjbhwheghipa --file supabase/tests/territorial_indicators_postflight.sql
```

Expected: firma y permisos correctos; filas únicas para los tres niveles; 125 municipios, 45 distritos locales y 40 federales para la versión examinada; cada segunda ejecución por debajo de 500 ms; sumas y procedencia reconciliadas; sin mutaciones.

- [ ] **Step 5: Crear Preview y verificar la historia completa**

Run: `npm.cmd exec vercel -- --yes`

Expected: despliegue Preview `READY`, nunca `--prod`.

En el Preview autenticado comprobar:

1. mapa político inicial y restauración exacta tras apagar temática;
2. municipio con padrón, lista nominal, población y cobertura;
3. distrito local y federal con relleno, popup y clave correcta;
4. `Sin dato` y cobertura parcial sin cero inventado;
5. cambio rápido de nivel/versión sin respuesta obsoleta;
6. sección clicable, popup, zoom, rueda, arrastre y controles direccionales;
7. vista móvil de Capas y Leyenda.

- [ ] **Step 6: Revisar diff y cerrar la rama**

Run:

```powershell
git status --short
git diff HEAD~6..HEAD --check
git log --oneline --decorate -8
```

Expected: sin cambios accidentales, secretos ni archivos generados. Si la verificación exigió una corrección, repetir su prueba focal y commit con `fix: ...`; si no hubo cambios, no crear commit vacío.
