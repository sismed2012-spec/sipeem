# Recuperación de la transferencia territorial a Producción

**Fecha:** 2026-10-01  
**Estado:** especificación pendiente de revisión del usuario  
**Ámbito:** recuperación del intento de datos fallido en SIPEEM-TERRITORIAL-PROD  
**Fuera de alcance:** Vercel, Production de la aplicación, Auth, Storage, sesiones y cualquier proyecto Supabase distinto de los dos refs autorizados.

## 1. Contexto y resultado buscado

La promoción territorial aplicó correctamente las 49 migraciones en SIPEEM-TERRITORIAL-PROD, pero el primer `data-apply` terminó en `FAILED_CONFIRMED`. La restauración usó una única transacción y el postflight posterior confirmó rollback completo: el esquema permanece sano y los datos canónicos no quedaron parcialmente cargados.

La causa es una colisión determinista entre datos sembrados por migración y el dump de datos. Seis catálogos se crean y llenan durante las migraciones, pero la política original también los clasificó como datos que debían copiarse. El primer `COPY` conflictivo es `public.cat_tipos_asentamiento`.

La recuperación debe transferir todos los datos canónicos faltantes sin borrar ni reinsertar los catálogos sembrados, sin reabrir el journal terminal, sin reintentos automáticos y sin debilitar el historial de auditoría.

## 2. Evidencia confirmada

Las comparaciones de sólo lectura entre SIPEEM-DEV y SIPEEM-TERRITORIAL-PROD confirmaron igualdad exacta de filas para:

- `public.cat_tipos_asentamiento`
- `public.cat_fuentes_evento`
- `public.cat_estados_evento`
- `public.cat_estados_georreferenciacion`
- `public.cat_niveles_sensibilidad`
- `public.cat_tipos_fuerza_electoral`

Estas seis tablas son precargas de esquema. No son datos operativos que deban restaurarse.

`public.fuerzas_electorales` no es una precarga equivalente: SIPEEM-DEV contiene 120 filas y el destino contiene 0. Por ello continuará incluida en la transferencia, junto con sus aliases e integrantes.

El artefacto fallido, su checksum y su journal se conservarán sin modificación. No se eliminarán filas ni catálogos del destino para hacer compatible ese artefacto.

## 3. Decisión arquitectónica

Se creará un ciclo de recuperación independiente, identificado por un nuevo manifiesto inmutable y un nuevo journal. El manifiesto de recuperación enlazará explícitamente el intento anterior y sólo podrá reconocer el esquema existente mediante verificaciones remotas de lectura.

Se descartan estas alternativas:

1. Reabrir `FAILED_CONFIRMED`: rompería la semántica terminal y ocultaría que existieron dos intentos de escritura.
2. Vaciar los catálogos del destino: introduce una mutación destructiva innecesaria y puede dejar claves foráneas o secuencias inconsistentes.
3. Editar manualmente el SQL ya generado: perdería reproducibilidad entre política, plan, artefacto y checksum.

## 4. Contrato de política de datos

La política cerrada incorporará una tercera clasificación, `preseeded`, además de `include` y `exclude`.

- `include`: datos canónicos que deben aparecer en el dump.
- `exclude`: staging o datos transitorios que deliberadamente no se promueven.
- `preseeded`: datos materializados por las migraciones que deben existir e igualar exactamente al origen, pero no deben aparecer en el dump.

Cada tabla del inventario de origen seguirá requiriendo una y sólo una clasificación. Una tabla nueva, desconocida o clasificada dos veces bloqueará el plan.

Cada entrada `preseeded` declarará:

- tabla exacta;
- migración responsable de la precarga;
- motivo revisado;
- columnas de orden canónico;
- secuencias propias esperadas, si existen.

Las seis tablas confirmadas serán las únicas entradas `preseeded` del primer contrato de recuperación. `public.fuerzas_electorales` seguirá en `include`.

Las dependencias desde tablas incluidas hacia tablas `preseeded` son válidas porque el esquema adoptado ya contiene las filas referenciadas. Cualquier dependencia en sentido inverso o una diferencia de contenido bloqueará la recuperación.

## 5. Sonda de catálogos precargados

Una consulta SQL de sólo lectura producirá un reporte determinista por tabla:

- nombre completamente calificado;
- número de filas;
- SHA-256 del agregado JSONB ordenado por su clave declarada;
- nombre, `last_value` e `is_called` de cada secuencia propia;
- hash global del reporte.

El orquestador ejecutará la misma consulta contra origen y destino. Para adoptar el esquema y crear un artefacto, ambos reportes deberán:

1. contener exactamente las tablas declaradas como `preseeded`;
2. tener conteos, hashes de filas y estados de secuencia idénticos;
3. no contener tablas adicionales ni valores nulos inesperados.

El reporte se utilizará como evidencia; no incluirá contraseñas, tokens ni cadenas de conexión.

## 6. Manifiesto de recuperación

El nuevo manifiesto será distinto del manifiesto fallido y añadirá un bloque `recovery` con:

- `predecessorManifestSha256`;
- estado terminal esperado `FAILED_CONFIRMED`;
- código de causa `PRESEEDED_TABLE_COLLISION`;
- SHA-256 de la evidencia del rollback/ausencia de datos;
- SHA-256 del reporte de catálogos precargados;
- modo `DATA_RECOVERY`.

El manifiesto conservará los refs autorizados, las 49 migraciones y las expectativas funcionales. Su hash cubrirá también la nueva política de datos y el bloque de recuperación. El validador comprobará que el manifiesto predecesor y su journal local existen, corresponden al mismo origen/destino y terminan en `FAILED_CONFIRMED`.

El nuevo hash producirá rutas nuevas para journal, artefacto y evidencias. Nada del intento anterior será sobrescrito.

## 7. Adopción segura del esquema existente

El ciclo de recuperación no volverá a ejecutar las 49 migraciones. Incorporará `schema-adopt`, una fase de lectura remota que sólo escribe el nuevo journal local.

Secuencia del journal de recuperación:

```text
CREATED
  -> PREFLIGHT_PASSED
  -> SCHEMA_ADOPTING
  -> SCHEMA_APPLIED
  -> DATA_APPLYING
  -> DATA_APPLIED
  -> VERIFYING
  -> VERIFIED
```

`schema-adopt` sólo llegará a `SCHEMA_APPLIED` si verifica:

- las 49 versiones de migración exactas;
- extensiones requeridas;
- objetos, RPC, RLS y privilegios esperados;
- ausencia de objetos operativos prohibidos;
- ausencia de datos canónicos parciales del intento anterior;
- igualdad exacta de los seis catálogos precargados.

Una diferencia terminará en `BLOCKED`; no intentará reparar el destino.

## 8. Generación del artefacto corregido

El nuevo `data-plan` ejecutará `pg_dump --data-only --use-copy` excluyendo:

- las tres tablas de staging ya aprobadas;
- las seis tablas `preseeded`;
- las secuencias propias de esas tablas, mediante la exclusión de sus tablas propietarias y una validación posterior del SQL.

Antes de publicar el artefacto temporal, un lint estructural comprobará que no exista:

- `COPY` para una tabla `preseeded`;
- `INSERT` para una tabla `preseeded`;
- `setval` para una secuencia declarada como precargada.

También comprobará que `public.fuerzas_electorales` continúe en el plan incluido. El artefacto sólo se renombrará a su ubicación definitiva después de pasar estas verificaciones y calcular SHA-256 y tamaño.

El artefacto anterior permanecerá intacto y no será reutilizado.

## 9. Nueva ejecución nativa única

El manifiesto de recuperación representa un intento nuevo, no un reintento del journal fallido. Sólo admitirá una llamada a `data-apply` con confirmación exacta:

```text
<recoveryManifestSha256>:DATA_APPLY
```

La restauración seguirá usando PostgreSQL 17.11 dentro de Docker, conexión por pooler y credenciales obtenidas del proveedor del sistema operativo. La contraseña sólo se pasará en el entorno del proceso hijo.

El comando usará una única transacción y `ON_ERROR_STOP=on`. Si el proceso devuelve código de salida entero distinto de cero, el nuevo journal terminará en `FAILED_CONFIRMED`. Si el resultado es indeterminado, terminará en `FAILED_UNKNOWN` y sólo permitirá sondas de lectura. Ningún estado repetirá automáticamente la restauración.

La escritura remota requerirá una única autorización explícita cuando el artefacto corregido y todos los preflights estén listos. Las fases de diseño, pruebas, comparación, adopción de esquema y generación del artefacto no cuentan como esa autorización.

## 10. Diagnóstico sanitizado

Cada fallo de proceso generará una evidencia runtime ignorada por Git con información limitada:

- fase;
- código de salida;
- código del runner;
- SQLSTATE, cuando esté disponible;
- clase normalizada del error, por ejemplo `UNIQUE_VIOLATION` o `FOREIGN_KEY_VIOLATION`;
- nombre de objeto sólo si coincide con un identificador PostgreSQL válido;
- SHA-256 de stdout y stderr ya redactados.

No se persistirá stderr completo, datos de filas, contraseñas, URLs con credenciales ni variables de entorno. El journal conservará únicamente el hash de esta evidencia; el CLI mostrará un resumen sanitizado.

## 11. Verificación posterior

Después de `DATA_APPLIED`, el postflight integral existente deberá conciliar como mínimo:

- 1 versión cartográfica;
- 7,052 secciones;
- 125 municipios;
- 45 distritos locales;
- 40 distritos federales;
- 6,544 secciones ECEG;
- 7,191 filas nominales;
- hashes y estados de las fuentes demográficas y nominales;
- SRID, geometrías nulas e inválidas;
- correspondencias ECEG y nominales;
- RPC, RLS, privilegios y ausencia de objetos operativos.

Además, repetirá la sonda de catálogos precargados. Sólo el conjunto completo de verificaciones podrá transicionar el nuevo journal a `VERIFIED`.

Vercel y la aplicación permanecerán sin cambios hasta alcanzar `VERIFIED`.

## 12. Pruebas y criterios de aceptación

La implementación seguirá TDD e incluirá pruebas para:

- clasificación cerrada `include`/`exclude`/`preseeded`;
- rechazo de tablas precargadas desconocidas, duplicadas o sin metadatos completos;
- exclusión exacta de seis tablas y sus secuencias del artefacto;
- permanencia de `fuerzas_electorales` en `include`;
- comparación de reportes iguales y bloqueo ante una sola diferencia de fila o secuencia;
- validación del vínculo con el manifiesto y journal fallidos;
- adopción de esquema exclusivamente por sondas de lectura;
- rutas nuevas que no sobrescriben artefactos anteriores;
- ejecución única y terminalidad por manifiesto;
- diagnóstico persistente sanitizado;
- suite territorial completa, regresiones, typecheck, build, ESLint enfocado y diff-check.

La recuperación estará lista para solicitar la única autorización de escritura cuando:

1. todas las pruebas estén verdes;
2. el manifiesto nuevo esté congelado;
3. `schema-adopt` haya terminado en `SCHEMA_APPLIED`;
4. los catálogos precargados coincidan exactamente;
5. el artefacto nuevo tenga checksum/tamaño y pase el lint estructural;
6. PROD siga sin datos canónicos parciales;
7. no haya cambios en Vercel ni en proyectos prohibidos.

