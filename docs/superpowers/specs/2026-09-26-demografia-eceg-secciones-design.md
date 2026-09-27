# Integración demográfica ECEG 2020 por sección — Diseño

**Fecha:** 2026-09-26

**Estado:** Aprobación de fuente y dirección recibida; ejecución pendiente de revisión de este diseño

**Entorno inicial:** SIPEEM-DEV (`nppvprbfmjbhwheghipa`)

## 1. Objetivo

Integrar en SIPEEM las *Estadísticas Censales a Escalas Geoelectorales 2020*
(ECEG) de INEGI como fuente principal de información demográfica por sección,
conservar ITER como fuente complementaria por localidad y mantener explícita
la diferencia entre el marco seccional INE de enero de 2021 y las cartografías
actuales o futuras de SIPEEM.

La carga debe ser idempotente, reanudable, auditable, limitada a SIPEEM-DEV y
capaz de continuar después de una interrupción sin repetir lotes confirmados.

## 2. Evidencia de origen verificada

Fuente oficial descargada:

- archivo: `ECEG_Distritos_Secciones_Nacional.zip`
- tamaño: 126,484,018 bytes
- SHA-256: `576c4821fcfd40a8b8a97c1c717b07d66ad07511bd7f81733edf0b28442b707b`
- SHA-256 XLSX: `8f409924e3f97fe4f839a8a9a2543d5d364c5ce161b87f9a322e5da4ee2bcc37`
- contenido: `ECEG_Distritos_Secciones_Nacional.xlsx` y metadatos
- cartografía electoral de referencia: INE, corte enero de 2021
- datos censales: Censo de Población y Vivienda 2020

El libro contiene 11 temas de indicadores además del índice: población,
fecundidad, migración, etnicidad, discapacidad, educación, características
económicas, servicios de salud, situación conyugal, hogares censales y
vivienda. En conjunto expone 220 indicadores precedidos por los mismos cinco
descriptores geográficos:

```text
Entidad federativa + Distrito federal + Grupo de complejidad 1
+ Municipio INE + Sección
```

El grupo de complejidad se conserva como atributo. La identidad seccional
dentro del conjunto es `(clave_entidad, numero_seccion)`; distrito y municipio
se validan entre hojas y se conservan como dimensiones de procedencia.

Para el Estado de México se verificó:

- 6,544 secciones únicas
- 125 municipios
- 41 distritos federales
- población seccional sumada: 16,992,418
- población estatal publicada: 16,992,418
- ninguna clave de sección duplicada
- 21 celdas ausentes y ninguna población seccional ausente

## 3. Compatibilidad con SIPEEM

La cartografía predeterminada de SIPEEM-DEV es la versión `4025`,
`INE_EDOMEX_2026_PRE_RESECCIONAMIENTO`, con 7,052 secciones.

Comparación inicial por número de sección:

- 6,401 candidatas por clave numérica
- 143 secciones ECEG 2021 ausentes en la versión 4025
- 1,800,168 habitantes en esas 143 secciones de origen
- 651 secciones de la versión 4025 sin fila ECEG directa

Una coincidencia de número permite un vínculo histórico inicial auditable, no
prueba por sí sola igualdad geométrica entre 2021 y 2026. La respuesta debe
declarar siempre el corte enero de 2021 y la calidad del vínculo. Una sección
de origen ausente no se divide ni se copia entre secciones sucesoras sin una
equivalencia oficial o una recomputación desde unidades censales más finas.

## 4. Principios de integridad

1. ECEG es la fuente principal para demografía seccional; ITER permanece
   disponible para análisis y capas de localidad.
2. El dato ECEG se conserva primero a su grano original y con su número de
   sección, distrito, municipio, fila y hash de registro.
3. El marco electoral de origen se registra como enero de 2021 y nunca se
   presenta como si hubiese sido calculado sobre la cartografía 2026.
4. Una sección ECEG sin correspondencia exacta queda `SIN_EQUIVALENCIA`.
5. Ningún total de una sección de origen puede duplicarse en varias secciones
   destino.
6. Las equivalencias uno-a-varios no distribuyen población sin una fuente de
   manzana/caserío que permita recalcular.
7. `*`, valores reservados y celdas vacías permanecen nulos con estado
   explícito; nunca se convierten a cero.
8. Un lote confirmado se identifica por checksum y se omite al reanudar. No
   existe reintento automático.
9. Las tablas crudas no son accesibles para `anon` ni `authenticated`; el RPC
   de lectura se invoca únicamente desde el servidor autenticado de SIPEEM.
10. Esta entrega no modifica PROD.

## 5. Modelo de datos

### 5.1 Fuente e indicadores

`demografia_fuentes` registra una nueva fuente `CPV2020_ECEG` con el hash del
ZIP, el hash del XLSX, el corte cartográfico y los conteos conciliados.
`demografia_indicadores` conserva los 220 indicadores normalizados, el tema,
el encabezado oficial, tipo lógico, unidad y reglas de reserva.

### 5.2 `demografia_eceg_secciones`

Tabla cruda por sección de origen:

- fuente y corte cartográfico
- entidad, distrito, municipio INE y sección
- fila de origen y hash de registro
- indicadores principales tipados
- conjunto completo en `indicadores jsonb`
- estados de dato en `estados_dato jsonb`

La clave única es `(demografia_fuente_id, clave_entidad, numero_seccion)`.

### 5.3 `demografia_eceg_correspondencias`

Relaciona cada sección de origen con una versión cartográfica SIPEEM:

- fuente y sección ECEG
- `cartografia_version_id`
- `cartografia_seccion_id` y `seccion_id` destino, cuando existan
- método: `CLAVE_NUMERICA`, `EQUIVALENCIA_OFICIAL`, `RECOMPUTADA` o `SIN_MATCH`
- estado: `VINCULO_HISTORICO`, `DIRECTA`, `SIN_EQUIVALENCIA` o
  `REVISION_MANUAL`
- evidencia y advertencias

`VINCULO_HISTORICO` puede mostrarse únicamente con el corte y la advertencia
visibles; `DIRECTA` queda reservada para equivalencia oficial o geométrica
verificada. En la primera carga, `CLAVE_NUMERICA` es el único método automático
permitido.

### 5.4 Lectura unificada

El RPC de sección prefiere una correspondencia ECEG publicada. Si no existe,
puede devolver el agregado ITER ya publicado para esa sección. La respuesta
incluye:

- conjunto y año censal
- grano de origen (`SECCION` o `LOCALIDAD`)
- corte cartográfico de origen
- método de correspondencia
- estado y advertencias
- indicadores

Los conteos de localidades son nulos para ECEG y conservan su significado
actual para ITER.

## 6. Pipeline

1. Perfilar el ZIP/XLSX sin escribir en Supabase.
2. Validar hojas, encabezados, claves, conteos y conciliación estatal.
3. Crear o recuperar la fuente por hash.
4. Cargar diccionario y 6,544 secciones en lotes de 250.
   Los lotes seccionales codifican el diccionario una sola vez y los valores
   como arreglos posicionales; el SQL real más grande verificado es de 622,617
   bytes, por debajo del límite observado del canal de consulta.
5. Construir correspondencias contra una versión explícita de SIPEEM.
6. Publicar únicamente las correspondencias `DIRECTA`.
7. Ejecutar postflight de conteos, población, duplicados, seguridad y RPC.
8. Verificar la interfaz en Preview; no desplegar a PROD.

## 7. Criterios de aceptación inicial

- 6,544 filas ECEG del Estado de México cargadas una sola vez.
- 220 indicadores documentados y conservados.
- 16,992,418 habitantes conciliados contra el total estatal.
- 6,401 candidatas por clave numérica reproducibles para la versión 4025,
  publicadas solo como vínculo histórico con advertencia.
- 143 filas de origen y 1,800,168 habitantes visibles como no equivalentes,
  sin duplicación ni reparto.
- 651 secciones actuales sin ECEG directo visibles como no disponibles o con
  fallback ITER explícito.
- El RPC y la interfaz muestran fuente, año, marco de origen y advertencia.
- Interrumpir y reanudar no repite lotes confirmados.
- RLS, grants y funciones pasan pruebas allow/deny.
- SIPEEM-DEV es el único destino; PROD no cambia.

## 8. Fuera de alcance inicial

- Reparto proporcional de una sección 2021 entre sucesoras.
- Inferencia por superficie o población sintética.
- Recomputación completa sobre el reseccionamiento 2026 sin datos de manzana,
  caserío y localidades rurales del Censo 2020.
- Eliminación de ITER o de las revisiones ya realizadas.
- Publicación en Producción.
