# Lista nominal INE por sección — Diseño

**Fecha:** 2026-09-28  
**Entorno inicial:** SIPEEM-DEV (`nppvprbfmjbhwheghipa`)  
**Fuente analizada:** `S.xlsx`  
**Corte de la fuente:** 2026-07-31  
**SHA-256:** `D016713ED9304AE696FBCF875141CF8268799D05468F1AFB79BB8785227DE161`

## Objetivo

Incorporar a SIPEEM el padrón electoral y la lista nominal más reciente del
INE por sección electoral, conservando el corte original, su desglose por sexo
y su relación explícita con cada versión cartográfica.

La carga no debe sobrescribir datos electorales históricos ni forzar las
secciones del nuevo reseccionamiento dentro de la cartografía publicada 4025.
Debe poder repetirse para futuros cortes del INE y para la cartografía que
reemplace o complemente la versión actual.

## Evidencia de la fuente

La hoja `S` contiene una fila especial para residentes en el extranjero y
7,191 filas seccionales. El perfil validado es:

| Métrica | Valor |
| --- | ---: |
| Secciones | 7,191 |
| Municipios | 125 |
| Distritos federales | 40 |
| Distritos locales | 45 |
| Padrón electoral | 13,407,250 |
| Lista nominal | 13,206,301 |
| Diferencia | 200,949 |
| Cobertura calculada | 98.501192% |
| Duplicados por sección | 0 |
| Filas con totales inconsistentes | 0 |
| Filas con cobertura inconsistente | 0 |
| Filas con valores negativos | 0 |

La comparación de solo lectura contra la versión cartográfica 4025 produjo:

| Resultado | Cantidad |
| --- | ---: |
| Coincidencias exactas por entidad, municipio y sección | 7,001 |
| Filas INE sin correspondencia exacta | 190 |
| Secciones 4025 sin fila INE exacta | 51 |
| Mismo número con municipio distinto | 2 |

Las secciones 696 y 6593 aparecen en municipio `024` en el corte del INE y en
municipio `025` en la cartografía 4025. Se tratarán como no vinculadas en esa
versión. Ningún proceso podrá resolverlas sólo por número de sección.

## Decisión de arquitectura

Se creará un subsistema de cortes nominales independiente de
`public.listas_nominales`.

La tabla existente representa lista nominal asociada a una elección y exige
`eleccion_id`. El archivo del INE es un corte administrativo periódico, no una
elección. Crear una elección ficticia mezclaría dos conceptos y dificultaría
comparar cortes futuros.

Tampoco se actualizará directamente `secciones.lista_nominal`: esa columna no
conserva historial, procedencia ni versión cartográfica, y no puede representar
las 190 filas todavía no vinculables.

## Modelo de datos

### `public.lista_nominal_cortes`

Una fila por archivo y fecha de corte.

Campos principales:

- `lista_nominal_corte_id`
- `clave`
- `fecha_corte`
- `fuente`
- `archivo_nombre`
- `archivo_sha256`
- `estado`: `RECIBIDO`, `VALIDADO`, `PUBLICADO` o `ARCHIVADO`
- totales estatales de padrón, lista nominal y diferencia
- `residentes_extranjero` como objeto JSONB con el desglose original
- `metadata`, `created_at`, `updated_at` y `publicado_at`

`archivo_sha256` será único. Una carga repetida del mismo archivo devolverá el
corte existente y no insertará nuevas filas.

### `public.lista_nominal_secciones`

Una fila por sección y corte. Conservará:

- entidad, municipio, distrito local, distrito federal y número de sección
- nombres de fuente cuando estén presentes
- padrón de hombres, mujeres, personas no binarias y total
- lista nominal de hombres, mujeres, personas no binarias y total
- diferencia y cobertura reportadas por el INE
- fila de origen y payload mínimo de auditoría

La llave única será `(lista_nominal_corte_id, clave_entidad, numero_seccion)`.
Las restricciones verificarán valores no negativos, sumas por sexo, diferencia
y cobertura. El municipio formará parte de la resolución cartográfica, aunque
el número de sección sea único en el archivo.

### `public.lista_nominal_correspondencias`

Relacionará una fila nominal con una versión cartográfica específica.

Campos principales:

- corte y fila nominal
- `cartografia_version_id`
- `cartografia_seccion_id`, `seccion_id` y `municipio_id`, anulables mientras
  no exista correspondencia
- `estado`: `VINCULADA`, `PENDIENTE`, `AMBIGUA` o `EXCLUIDA`
- `motivo` y `metadata`

Existirá exactamente una evaluación por fila nominal y versión cartográfica.
La resolución exigirá coincidencia simultánea de:

1. `clave_entidad`
2. `clave_municipio`
3. `numero_seccion`

No se inferirán padres, equivalencias ni geometrías a partir de proximidad o de
la continuidad numérica.

## Flujo de importación

El importador será un comando Node.js independiente con estas propiedades:

1. Aceptará `.xlsx`, SIPEEM-DEV y una versión cartográfica.
2. Validará títulos, fecha de corte, encabezados y tipos antes de generar SQL.
3. Separará la fila `0000` de residentes en el extranjero.
4. Generará un perfil y un manifiesto con SHA-256.
5. Operará en simulación salvo que se indique `--apply`.
6. Preparará lotes deterministas, pequeños y reanudables.
7. No reintentará automáticamente una operación fallida.
8. Registrará el checksum confirmado de cada lote.
9. Ejecutará una validación posterior de solo lectura.

La primera carga se limitará a SIPEEM-DEV. El importador rechazará cualquier
otro `project-ref`; no contendrá una opción de Producción.

## Estados y publicación

Un corte seguirá esta secuencia:

`RECIBIDO → VALIDADO → PUBLICADO → ARCHIVADO`

- `RECIBIDO`: los lotes pueden completarse o reanudarse.
- `VALIDADO`: perfil, integridad y correspondencias comprobados.
- `PUBLICADO`: disponible para RPC y aplicación; sus filas quedan inmutables.
- `ARCHIVADO`: consultable históricamente, pero no es el corte predeterminado.

Sólo un corte podrá ser el predeterminado para una fecha y entidad. Publicar un
nuevo corte no borrará el anterior.

## Lectura y aplicación

Se añadirán RPC de lectura con `SECURITY INVOKER` para:

- listar cortes consultables;
- obtener el último dato nominal vinculado de una sección en una versión;
- consultar cobertura y pendientes por versión cartográfica.

El popup de sección mostrará:

- fecha de corte;
- padrón electoral;
- lista nominal;
- desglose por sexo;
- diferencia y cobertura;
- estado de correspondencia.

Si una sección cartográfica no tiene dato exacto, la interfaz mostrará
`Sin dato nominal para este corte`; no usará cero ni copiará datos de una
sección vecina. La aplicación seguirá funcionando si el subsistema nominal no
está configurado.

## Seguridad

- RLS quedará activada en las tablas expuestas.
- `anon` y `authenticated` no tendrán acceso directo a las tablas.
- Los privilegios se concederán de forma explícita.
- Las funciones públicas no usarán `SECURITY DEFINER`.
- El `service_role` permanecerá exclusivamente en el servidor.
- La aplicación consultará el dato mediante una ruta autenticada y una lista
  cerrada de RPC.
- No se escribirán secretos, archivos fuente ni SQL con credenciales en Git.

## Validaciones obligatorias

Las pruebas automatizadas deberán demostrar:

1. detección exacta del encabezado y del corte 2026-07-31;
2. perfil de 7,191 secciones y una fila de residentes en el extranjero;
3. ausencia de duplicados y reconciliación de totales;
4. rechazo de números negativos, sumas incorrectas y cobertura inválida;
5. idempotencia por SHA-256;
6. coincidencia exacta por entidad, municipio y sección;
7. resultado 4025 de 7,001 vinculadas, 190 pendientes y 51 destinos sin dato;
8. tratamiento de 696 y 6593 como no vinculadas en 4025;
9. rechazo de un `project-ref` distinto de SIPEEM-DEV;
10. reanudación desde el último checksum confirmado, sin reintento automático;
11. lectura del corte publicado y respuesta nula explícita cuando no haya dato;
12. conservación del mapa y de la demografía existentes.

## Despliegue inicial

1. Ejecutar pruebas unitarias del parser, perfil, lotes y correspondencias.
2. Aplicar la migración de esquema únicamente en SIPEEM-DEV.
3. Ejecutar preflight de sólo lectura.
4. Generar el paquete de importación en simulación.
5. Cargar el corte por lotes reanudables.
6. Construir correspondencias para la versión 4025.
7. Ejecutar postflight de sólo lectura y reconciliar conteos y totales.
8. Publicar el corte en SIPEEM-DEV.
9. Integrar la ruta y el popup; validar en local y Preview.

No se realizará ninguna carga en Producción dentro de esta entrega.

## Compatibilidad con el reseccionamiento

Cuando se reciba la nueva cartografía del INE se creará otra
`cartografia_version_id`. El mismo corte nominal se evaluará contra esa versión
y generará nuevas correspondencias. Las relaciones con 4025 permanecerán
intactas para consultas históricas.

La arquitectura permite que un corte nominal y una cartografía tengan fechas
distintas sin fingir que pertenecen al mismo marco territorial.

## Fuera de alcance

- Crear geometrías para las 190 filas no vinculadas.
- Sustituir la cartografía 4025.
- Modificar resultados o participación de elecciones históricas.
- Promover datos a Producción.
- Usar localidad o límite de localidad para adivinar una correspondencia.
