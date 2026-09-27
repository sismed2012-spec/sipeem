# Integración demográfica INEGI por sección — Diseño

**Fecha:** 2026-09-26  
**Estado:** Aprobado en conversación  
**Entorno inicial:** SIPEEM-DEV (`nppvprbfmjbhwheghipa`)

## 1. Objetivo

Integrar los indicadores del archivo `iter_15_cpv2020_csv.zip` del Censo de
Población y Vivienda 2020 al modelo territorial de SIPEEM, conservando la
fuente original a nivel localidad y publicando agregados por sección solamente
cuando la asignación geográfica sea defendible y no duplique población.

La integración debe ser reproducible, versionada por censo y cartografía,
reanudable después de interrupciones y compatible con el reseccionamiento
electoral futuro.

## 2. Evidencia de origen y límites conocidos

El ZIP contiene:

- 5,136 filas totales.
- 4,894 localidades reales.
- 125 totales municipales.
- 116 filas especiales con claves `9998` o `9999`.
- 286 columnas.
- 16,992,418 habitantes conciliados contra el total estatal.
- 101,029 celdas con `*`, que representan un valor reservado y no deben
  convertirse a cero.
- Un BOM UTF-8, aunque el contenido requiere decodificación Latin-1/Windows
  occidental.

La cartografía publicada de SIPEEM contiene 7,052 secciones, 3,639 puntos de
localidad y 1,826 límites de localidad. De los límites existentes, 364
intersectan una sola sección y 1,462 intersectan varias. Por ello no es válido
asignar toda la población de una localidad a la sección de su centroide ni
replicar el total en cada sección intersectada.

## 3. Principios de integridad

1. El conjunto INEGI se conserva a su grano original: una localidad por censo.
2. Ningún valor reservado se interpreta como cero.
3. Ninguna persona o vivienda puede contabilizarse más de una vez en un
   agregado seccional.
4. Los agregados parciales deben declarar su cobertura y población pendiente.
5. Las correspondencias territoriales son versionadas y auditables.
6. Un cambio de cartografía recalcula correspondencias, no reimporta el censo.
7. Las localidades multisección permanecen pendientes hasta contar con datos
   de manzana o AGEB, salvo que posteriormente se apruebe un método estimado.

## 4. Modelo de datos

### 4.1 `demografia_fuentes`

Registra una fuente inmutable de datos demográficos:

- proveedor (`INEGI`)
- conjunto (`CPV2020_ITER`)
- año censal
- entidad
- nombre y SHA-256 del archivo
- codificación detectada
- número de filas y columnas
- metadatos y estado de carga
- marcas de creación, validación y publicación

La combinación proveedor, conjunto, año, entidad y hash identifica una carga
sin ambigüedad.

### 4.2 `demografia_indicadores`

Diccionario versionado de las 286 variables:

- mnemónico original
- nombre y descripción
- tipo lógico
- unidad
- categoría temática
- reglas de valor reservado
- indicador de exposición en resumen
- orden de presentación

### 4.3 `demografia_localidades`

Conserva el registro canónico por localidad INEGI y fuente:

- claves de entidad, municipio y localidad
- nombre oficial
- punto INEGI
- población, sexo, edades y vivienda como columnas principales tipadas
- demás valores originales en `indicadores jsonb`
- estados de dato reservado por indicador
- fila de origen y hash de registro

La clave única es `(demografia_fuente_id, clave_entidad,
clave_municipio, clave_localidad)`.

### 4.4 `demografia_localidad_correspondencias`

Relaciona una localidad censal con la cartografía SIPEEM:

- fuente y localidad INEGI
- `cartografia_version_id`
- localidad cartográfica, cuando exista
- municipio y sección candidatos
- método: `CLAVE`, `NOMBRE_COORDENADA`, `ESPACIAL`, `MANUAL`
- distancia y señales usadas
- confianza
- estado: `DIRECTA`, `MULTISECCION`, `SIN_CORRESPONDENCIA`,
  `REVISION_MANUAL`
- evidencia y marcas de revisión

Una correspondencia automática solo puede quedar `DIRECTA` cuando la evidencia
territorial determine una única sección.

### 4.5 `demografia_secciones`

Materializa agregados por fuente, cartografía y sección. Incluye los
indicadores sumables aprobados, el detalle completo en JSONB y la fecha de
cálculo. Solo incorpora localidades con correspondencia `DIRECTA`.

### 4.6 `demografia_secciones_cobertura`

Registra para cada sección:

- localidades incluidas
- localidades pendientes
- población incluida
- población pendiente
- porcentaje de cobertura
- método y nivel de confianza
- advertencias de calidad

La ausencia de cobertura se representa como ausencia de dato, nunca como cero.

## 5. Pipeline de importación

### Etapa A — Preflight

1. Calcular el SHA-256 del ZIP.
2. Verificar los cuatro recursos esperados dentro del archivo.
3. Validar encabezados, número de columnas y diccionario.
4. Detectar y registrar la codificación real.
5. Clasificar filas estatales, municipales, localidades y filas especiales.
6. Generar un reporte sin escribir datos si falla cualquier condición crítica.

### Etapa B — Carga canónica

1. Crear o recuperar la fuente por su clave idempotente.
2. Cargar diccionario e indicadores.
3. Importar localidades en lotes reanudables.
4. Conservar `*` como estado reservado.
5. Conciliar los 125 municipios y el total estatal.

Cada lote registra rango, conteos, checksum, inicio, final y resultado. Un lote
confirmado no se repite automáticamente.

### Etapa C — Correspondencias

El motor genera candidatos mediante:

1. municipio homologado
2. nombre normalizado
3. proximidad de coordenadas
4. contención o intersección geométrica
5. consistencia con la sección asociada

Las coincidencias ambiguas permanecen en revisión. El código de localidad del
INE no se considera equivalente al código de localidad INEGI sin evidencia
adicional.

### Etapa D — Agregación seccional

1. Vaciar únicamente la materialización de la fuente y versión objetivo dentro
   de una transacción.
2. Agregar indicadores sumables de correspondencias `DIRECTA`.
3. Calcular cobertura y pendientes.
4. Verificar que la población agregada no exceda la población de origen.
5. Publicar la materialización solo después del postflight aprobado.

## 6. Validaciones obligatorias

- 125 municipios presentes y conciliados.
- 4,894 claves reales únicas en la fuente analizada.
- Total estatal de 16,992,418 habitantes.
- Ningún `*` convertido a cero.
- Ninguna correspondencia directa con más de una sección.
- Ninguna localidad incluida dos veces en el mismo agregado censal.
- Suma seccional menor o igual al universo censal incluido.
- Conteos de incluidos y pendientes por municipio y sección.
- Reejecución idempotente con los mismos hashes y resultados.
- RLS y privilegios verificados antes de exposición por Data API.

## 7. API y experiencia de usuario

La ficha de sección y el mapa mostrarán inicialmente:

- población total, mujeres y hombres
- grupos principales de edad y población de 18 años o más
- escolaridad y analfabetismo
- población económicamente activa y ocupada
- derechohabiencia
- discapacidad
- población indígena y afromexicana
- viviendas habitadas y servicios básicos
- disponibilidad de celular, computadora e internet

Cada respuesta y bloque visual incluirá año censal, versión cartográfica,
cobertura, método, confianza y población pendiente. La interfaz mostrará una
advertencia cuando el agregado sea parcial.

La API permitirá consultar resumen por sección, indicadores completos por
localidad y métricas de cobertura. Todos los filtros usarán claves de negocio
estables y nunca `OBJECTID`.

## 8. Seguridad y auditoría

- RLS activa en todas las tablas expuestas.
- Lectura para usuarios autenticados conforme al modelo de autorización de
  SIPEEM.
- Importación, correspondencias y recálculo solo desde procesos de servidor.
- Ninguna clave privilegiada en el navegador.
- Funciones privilegiadas, si fueran inevitables, fuera del esquema expuesto,
  con `search_path` fijo y `EXECUTE` revocado a `PUBLIC`.
- Auditoría de cargas, lotes, revisiones manuales, recálculos y publicación.

## 9. Despliegue seguro

1. Diseñar y probar migraciones localmente o mediante SQL iterativo sin generar
   historial remoto intermedio.
2. Ejecutar preflight de solo lectura en SIPEEM-DEV.
3. Aplicar migraciones únicamente en SIPEEM-DEV.
4. Importar y validar por lotes reanudables.
5. Revisar postflight de solo lectura.
6. Habilitar la interfaz en Preview.
7. Solicitar una aprobación separada antes de cualquier cambio en Producción.

La primera entrega no modifica simulaciones estratégicas ni utiliza cobertura
parcial para recomendaciones políticas automáticas.

## 10. Criterios de aceptación

- La fuente y las 4,894 localidades se cargan de forma idempotente.
- Los totales estatales y municipales concilian con el archivo.
- Cada agregado seccional tiene cobertura y trazabilidad visibles.
- Las localidades multisección no aportan población a una sección hasta contar
  con una asignación defendible.
- El sistema puede recalcular resultados para una nueva cartografía sin
  duplicar el Censo 2020.
- La ficha de sección distingue claramente dato completo, parcial y pendiente.
- Interrumpir y reanudar la carga no duplica ni pierde filas.

## 11. Fuera de alcance inicial

- Estimación proporcional por superficie.
- Desagregación sintética de localidades urbanas.
- Datos censales a nivel manzana o AGEB que aún no fueron proporcionados.
- Publicación en Producción.
- Uso automático en el motor de recomendaciones o simulación.
