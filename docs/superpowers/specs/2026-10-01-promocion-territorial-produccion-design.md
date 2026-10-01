# Promoción territorial a Producción — Diseño

**Fecha:** 2026-10-01  
**Estado:** pendiente de revisión de la especificación  
**Fuente:** SIPEEM-DEV (`nppvprbfmjbhwheghipa`)  
**Destino:** SIPEEM-TERRITORIAL-PROD (`cdvukcthosppezjscwod`)  
**Aplicación:** proyecto Vercel `sipeem`

## 1. Propósito

Separar el dominio territorial del dominio operativo de SIPEEM y promover a
una base Supabase dedicada el esquema y los datos territoriales que ya fueron
validados en SIPEEM-DEV. El proceso debe ser reproducible, auditable,
reanudable y seguro ante interrupciones, falta de créditos o fallos de red.

La promoción no cambiará el origen territorial utilizado por la aplicación
hasta que el nuevo proyecto haya pasado todas las validaciones de solo lectura.
El cambio de Vercel será una fase independiente y reversible.

## 2. Contexto confirmado

El repositorio contiene actualmente dos historias de base de datos en
`supabase/migrations`:

- migraciones operativas `001` a `019`, correspondientes a la base principal
  de SIPEEM;
- migraciones territoriales con timestamp `202609...`, correspondientes a
  cartografía, datos electorales, demografía, lista nominal e indicadores.

Aplicar ese directorio mezclado a una base nueva podría crear objetos
operativos dentro de la base territorial. Por ello, la separación física de
los workdirs es una condición previa a cualquier escritura en Producción.

El estado observado de SIPEEM-DEV es:

| Elemento | Valor observado |
| --- | ---: |
| Tamaño total aproximado | 842 MB |
| Versiones cartográficas | 1 |
| Secciones cartográficas | 7,052 |
| Municipios | 125 |
| Distritos locales | 45 |
| Distritos federales | 40 |
| Secciones demográficas ECEG | 6,544 |
| Filas nominales | 7,191 |

SIPEEM-TERRITORIAL-PROD está activo, usa PostgreSQL 17 y no contiene tablas de
usuario ni historial de migraciones. Su contraseña de base se conserva fuera
del repositorio en el almacén de credenciales del sistema operativo.

La aplicación ya separa sus conexiones mediante
`CARTOGRAFIA_SUPABASE_URL` y `CARTOGRAFIA_SUPABASE_SERVICE_ROLE_KEY`. La base
principal de autenticación y operación no será modificada por esta entrega.

## 3. Objetivos y criterios de éxito

La promoción será correcta cuando:

1. las migraciones operativas y territoriales tengan workdirs independientes;
2. ninguna orden territorial pueda escribir en un proyecto fuera de la lista
   cerrada de referencias permitidas;
3. una simulación enumere exactamente las migraciones pendientes antes de
   ejecutar cualquier escritura;
4. el esquema territorial pueda reconstruirse desde cero en el nuevo proyecto;
5. los datos promovidos reconcilien conteos y totales con un manifiesto de la
   fuente;
6. una interrupción deje evidencia suficiente para reanudar desde el último
   paso confirmado sin repetir escrituras a ciegas;
7. RLS, privilegios, funciones y extensiones pasen validaciones explícitas;
8. la aplicación conserve su configuración anterior hasta el corte final;
9. el corte de Vercel pueda revertirse restaurando únicamente dos variables de
   entorno y redeplegando el último artefacto estable;
10. ninguna fase utilice reintentos automáticos para operaciones de escritura.

## 4. Decisión de arquitectura

Se usará un **workdir Supabase territorial independiente** y un **promotor
controlado por manifiesto**.

La estructura objetivo será:

```text
supabase/
  migrations/                 # sólo dominio operativo de SIPEEM

infra/territorial/
  supabase/
    config.toml
    migrations/               # historia canónica territorial
    tests/                    # preflight, postflight, seguridad y contratos
  manifests/
    production/               # manifiestos inmutables, sin secretos
  journals/                   # ignorado por Git; estado local de una ejecución

scripts/territorial-promotion/
  cli.mjs                     # interfaz y máquina de estados
  policy.mjs                  # refs, fases y operaciones permitidas
  manifest.mjs                # hashes, orden y validación
  supabase-cli.mjs            # invocación sin shell y captura de evidencia
  database-transfer.mjs       # preparación/restauración lógica
  verification.mjs            # postflight y reconciliación
```

El CLI oficial se ejecutará con `--workdir infra/territorial`, cuya semántica
fue confirmada con Supabase CLI 2.119.0. No se dependerá del descubrimiento
ascendente del directorio `supabase/`.

La historia territorial existente se trasladará sin modificar contenido ni
timestamp. Los tests territoriales y scripts que dependan de rutas serán
actualizados en el mismo cambio. Las migraciones operativas permanecerán en el
workdir actual.

## 5. Matriz estricta de entornos

| Rol | Nombre | Project ref | Escritura permitida |
| --- | --- | --- | --- |
| fuente | SIPEEM-DEV | `nppvprbfmjbhwheghipa` | no durante promoción |
| destino | SIPEEM-TERRITORIAL-PROD | `cdvukcthosppezjscwod` | sólo fase autorizada |
| prohibido | SIPEEM | `xvdqlozimvqluwxpbizx` | nunca |
| prohibido | SIPEEM-PREVIEW | `ljlfezcpckrmbrmucbva` | nunca |

El promotor verificará la referencia declarada, la referencia enlazada por el
CLI y una sonda SQL del destino. Cualquier discrepancia detendrá la ejecución
antes de escribir. La política no aceptará referencias arbitrarias por línea
de comandos.

## 6. Manifiesto de promoción

Cada promoción tendrá un manifiesto versionado con:

- identificador único y fecha de creación;
- commit Git exacto;
- referencia y versión PostgreSQL de origen y destino;
- lista ordenada de migraciones y SHA-256 de cada archivo;
- tablas incluidas en la transferencia de datos;
- tablas excluidas y justificación;
- conteos y totales esperados de control;
- versión cartográfica, cortes nominales y fuentes demográficas publicadas;
- versión del CLI y requisitos de ejecución;
- checksum global del manifiesto.

El manifiesto no contendrá contraseñas, tokens, cadenas de conexión ni claves
de servicio. Un cambio de archivo posterior a su aprobación invalidará el
manifiesto y obligará a generar otro.

## 7. Fases de la promoción

### Fase 0 — Preflight de solo lectura

Comprobará identidad, región, versión PostgreSQL, extensiones, espacio,
conectividad, estado del destino, historial de migraciones, procesos externos y
disponibilidad de Docker/Postgres client. También analizará las migraciones en
busca de control transaccional interno, referencias a proyectos no permitidos,
`SECURITY DEFINER`, concesiones a `PUBLIC`, objetos fuera del dominio y
operaciones destructivas.

Una advertencia no se convertirá automáticamente en aprobación. Las
condiciones críticas producirán un bloqueo explícito y no dejarán una
ejecución parcialmente iniciada.

La actualización PostgreSQL 17.11 requiere revisar en particular `pgcrypto`,
`btree_gist`, `ltree` y operadores personalizados. El preflight registrará si
hay índices o cifrados afectados antes de copiar datos.

### Fase 1 — Esquema

1. Validar hashes y orden del manifiesto.
2. Ejecutar `db push --dry-run` contra el destino territorial.
3. Comparar la salida con la lista exacta del manifiesto.
4. Ejecutar una única aplicación del esquema, sin `--include-seed`.
5. Ejecutar postflight de sólo lectura y registrar el historial remoto.

Si la escritura falla, el promotor marcará la fase como `FAILED_UNKNOWN` o
`FAILED_CONFIRMED` según la evidencia. No volverá a ejecutar nada hasta que una
sonda de sólo lectura determine qué migraciones quedaron registradas.

### Fase 2 — Datos

La transferencia será lógica y controlada. La base nueva no recibirá los
esquemas operativos de SIPEEM ni datos de autenticación. La selección canónica
de tablas estará en el manifiesto y se validarán todas sus dependencias antes
del dump.

Se excluirán las tablas de staging cuando no sean necesarias para la lectura
publicada. Como `supabase db dump --data-only` admite exclusiones, pero no una
lista positiva de tablas, el generador deberá calcular y mostrar la lista de
exclusión a partir del catálogo real. Si aparece una tabla desconocida, el
proceso se bloqueará en vez de incluirla por omisión.

El artefacto de datos tendrá SHA-256, tamaño, fecha y conteos por tabla. La
restauración se ejecutará una sola vez, con evidencia por paso. Antes de
reanudar tras un fallo se consultará el destino y se decidirá si continuar,
compensar o reconstruir el proyecto; nunca se repetirá automáticamente el
archivo completo.

Docker es actualmente una dependencia bloqueante para el flujo oficial de
dump/restauración de la CLI: el cliente está instalado, pero el daemon no está
disponible. La implementación puede completar separación, pruebas, manifiesto
y simulación, pero no iniciará la Fase 2 hasta que el preflight confirme Docker
saludable o se apruebe y valide una alternativa nativa equivalente.

### Fase 3 — Validación integral

El postflight será de sólo lectura e incluirá:

- hashes e historial de migraciones;
- extensiones y versiones;
- conteos de territorios y geometrías;
- validez geométrica y SRID;
- relaciones de padre, correspondencias y solapes;
- conteos y totales electorales;
- 7,052 secciones, 125 municipios, 45 distritos locales y 40 federales para
  la versión cartográfica promovida;
- 6,544 secciones ECEG y 7,191 filas nominales del conjunto esperado;
- cortes y fuentes con el mismo estado de publicación que el manifiesto;
- RPC nominales, demográficas, cartográficas y de indicadores;
- RLS, privilegios, `search_path` y ejecutabilidad por rol;
- asesores de seguridad y rendimiento de Supabase;
- ausencia de tablas operativas o credenciales en el destino.

Los números anteriores son expectativas del primer manifiesto, no constantes
del código. Cada promoción futura deberá declarar sus propios valores.

### Fase 4 — Corte de aplicación

Sólo después de que la Fase 3 termine en `VERIFIED` se actualizarán en Vercel:

- `CARTOGRAFIA_SUPABASE_URL`;
- `CARTOGRAFIA_SUPABASE_SERVICE_ROLE_KEY`.

La clave permanecerá cifrada en Vercel y sólo será usada en rutas servidor. Se
creará primero un Preview desde el commit verificado y se probarán login, mapa,
municipios, secciones, demografía, lista nominal e indicadores. Producción se
promoverá como una operación separada después de esa verificación.

El rollback del corte conserva los valores anteriores en un registro operativo
fuera de Git. Restaurarlos y redeplegar devuelve las lecturas a la base previa;
no exige deshacer el esquema del nuevo proyecto.

## 8. Máquina de estados y reanudación

Cada ejecución tendrá uno de estos estados:

```text
CREATED
  -> PREFLIGHT_PASSED
  -> SCHEMA_APPLYING -> SCHEMA_APPLIED
  -> DATA_APPLYING   -> DATA_APPLIED
  -> VERIFYING       -> VERIFIED
  -> PREVIEW_CUTOVER -> PREVIEW_VERIFIED
  -> PROD_CUTOVER    -> COMPLETE
```

Cualquier fase puede terminar en `BLOCKED`, `FAILED_CONFIRMED` o
`FAILED_UNKNOWN`. Sólo las fases de lectura pueden repetirse libremente. Una
fase de escritura requiere un journal cuyo manifiesto, commit y project ref
coincidan exactamente.

El journal será local, sin secretos y escrito de forma atómica. Registrará
inicio y fin de cada paso, código de salida, hash de evidencia y resultado de
las sondas. La pérdida de créditos o conectividad produce `BLOCKED`; al
restablecerse, la ejecución comienza con sondas de lectura y continúa desde el
último estado confirmado.

## 9. Seguridad

- Ningún `service_role`, contraseña o URL con credenciales se escribirá en
  Git, logs, manifiestos ni argumentos visibles del proceso.
- Los secretos se obtendrán del almacén del sistema operativo o del proveedor.
- Toda tabla de un esquema expuesto tendrá RLS y privilegios explícitos.
- Las funciones públicas serán `SECURITY INVOKER` salvo excepción revisada,
  y usarán `search_path` fijo o referencias calificadas.
- Se revocará la ejecución implícita de `PUBLIC` cuando corresponda.
- El navegador nunca recibirá la clave territorial privilegiada.
- El promotor rechazará `--include-seed`, resets remotos y referencias no
  permitidas.
- El proyecto principal de SIPEEM y el proyecto Preview son destinos
  permanentemente denegados por la política.

Las nuevas reglas de Supabase para exposición de tablas se tratarán separadas
de RLS: la API sólo expondrá los objetos requeridos y concederá acceso de forma
explícita.

## 10. Manejo de errores

- **Docker ausente:** bloquear antes del dump; conservar manifiesto y journal.
- **Hash distinto:** invalidar la ejecución completa; no actualizar hashes en
  caliente.
- **Proyecto incorrecto:** abortar antes de cualquier SQL.
- **Destino no vacío inesperadamente:** comparar catálogo e historial; bloquear.
- **Migración parcialmente aplicada:** consultar historial y objetos; no
  reintentar hasta clasificar el estado.
- **Tabla nueva en origen:** bloquear la generación del dump hasta clasificarla.
- **Restauración parcial:** registrar `FAILED_UNKNOWN`, medir destino y elegir
  una recuperación explícita.
- **Postflight distinto:** no cambiar Vercel; mantener el origen anterior.
- **Preview fallido:** revertir sólo sus variables o despliegue; Producción no
  cambia.
- **Pérdida de créditos:** detener y reanudar mediante journal cuando el
  servicio vuelva, sin repetir escrituras automáticamente.

## 11. Estrategia de pruebas

### 11.1 Pruebas unitarias

- separación exacta de migraciones operativas y territoriales;
- lista cerrada de project refs y rechazo de cualquier otra;
- orden y SHA-256 del manifiesto;
- simulación como comportamiento predeterminado;
- rechazo de hashes, commits o journals obsoletos;
- reanudación desde cada estado confirmado;
- clasificación de fallo conocido y desconocido;
- bloqueo cuando Docker no está disponible;
- detección de tablas nuevas no clasificadas;
- redacción de secretos en argumentos, errores y logs.

### 11.2 Pruebas de integración sin escritura remota

- catálogo territorial desde un fixture representativo;
- salida exacta de `db push --dry-run`;
- generación determinista de exclusiones y dump;
- restauración simulada y reconciliación de conteos;
- postflight contra fixtures con faltantes, objetos extra y privilegios
  inseguros.

### 11.3 Ensayo remoto controlado

El destino recién creado se usará primero para el esquema porque está vacío y
es recuperable. Cada transición se realizará sólo después de verificar la
anterior. Las pruebas de escritura no usarán SIPEEM, SIPEEM-PREVIEW ni Vercel
Production.

## 12. Observabilidad y evidencia

Cada fase producirá un resumen legible y un archivo de evidencia con:

- manifiesto y commit;
- proyecto sondeado;
- hora de inicio y fin;
- versión de herramientas;
- resultado y código de salida;
- conteos y hashes sin secretos;
- siguiente acción permitida.

Los artefactos grandes, dumps y journals no se versionarán. Git conservará el
manifiesto, las consultas de verificación y la documentación necesaria para
reproducir el proceso.

## 13. Secuencia de implementación

1. Separar los workdirs y reparar todas las rutas de scripts/tests.
2. Añadir política estricta de proyectos y pruebas.
3. Crear manifiesto, hashes y journal reanudable.
4. Implementar preflight y análisis estático de migraciones.
5. Implementar simulación y aplicación controlada del esquema.
6. Implementar inventario de datos y generación segura del dump.
7. Recuperar Docker y validar dump/restauración de forma controlada.
8. Restaurar datos y ejecutar el postflight integral.
9. Crear Preview de aplicación con las variables del nuevo proyecto.
10. Validar Preview y preparar el corte reversible de Producción.

Cada punto será una tarea verificable del plan de implementación. Esta
especificación no autoriza por sí sola una escritura remota.

## 14. Fuera de alcance

- Copiar usuarios de Auth, sesiones o datos operativos de SIPEEM.
- Copiar archivos de Storage o funciones Edge.
- Usar restauración física completa hacia otro proyecto.
- Borrar o reconstruir SIPEEM-DEV.
- Aplicar migraciones territoriales a SIPEEM o SIPEEM-PREVIEW.
- Promover una nueva cartografía o nuevo corte de datos durante esta migración.
- Sustituir el visor SVG por ArcGIS.
- Cambiar Production antes de que Preview y el postflight estén verificados.

## 15. Decisiones aplazadas

- Automatización CI/CD de futuras promociones territoriales.
- Réplicas, PITR o políticas avanzadas de continuidad operativa.
- Archivo o eliminación de staging en SIPEEM-DEV después de la promoción.
- Rotación programada de las credenciales territoriales.
- Desmantelamiento del origen territorial anterior después del periodo de
  observación.
