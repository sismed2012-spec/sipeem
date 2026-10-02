# Importador INE: verificación de contrato en DEV

Fecha: 2026-10-01. Código comprobado: `93b91746d9c0dac630bb0a9a10edf86cd5137069`.
Proyecto: SIPEEM-DEV (`nppvprbfmjbhwheghipa`).

## Evidencia

- El comando nativo `npm.cmd exec supabase -- db query --linked --project-ref nppvprbfmjbhwheghipa` ejecutó una consulta SELECT y encontró la versión 4025, clave `INE_EDOMEX_2026_PRE_RESECCIONAMIENTO`, estado `PUBLICADA`.
- El catálogo PostgreSQL confirmó las siete RPC requeridas y sus firmas.
- La carga asociada 1793 estaba `COMPLETA` antes y después de las comprobaciones.
- Se planificaron con `EXPLAIN (ANALYZE false, FORMAT JSON)` las consultas generadas de inicio, evidencias, validación y publicación. Todas dentro de transacciones `READ ONLY` terminadas con `ROLLBACK`.
- La firma y el lookup de la RPC de importación se planificaron con un payload JSON vacío. Esto no prueba el procesamiento de geometrías.
- Una transferencia de SQL de LOCALIDAD a través de la salida de herramientas quedó truncada y produjo un error de decodificación base64 durante la planificación. No se ejecutó la RPC; no se considera evidencia del lote original ni un defecto confirmado del artefacto. Para una prueba integral debe usarse el archivo local sellado, sin transportar el payload mediante salida textual.
- `node --test scripts/cartografia/*.test.mjs`: 33 pruebas, 32 aprobadas, 1 integración opcional omitida, 0 fallos.

## Alcance y siguiente puerta

Esta es una verificación de conexión y contrato SQL, no una importación integral ni una aceptación de publicación. No se ejecutaron cargas, validaciones mutantes, publicaciones ni cambios en PROD. Tampoco se fusionó el PR.

La versión publicada no debe reutilizarse como destino de una prueba de importación. La prueba integral pendiente requiere una versión de ensayo aislada y un contrato compatible con las restricciones inmutables del servidor; debe conservarse la cartografía publicada y detenerse ante el primer error, sin reintentos automáticos.

## Ensayo transaccional real: inicio, evidencias y ENTIDAD

Se añadió `scripts/cartografia/dev-rollback.integration.test.mjs`, optativo y fijado exclusivamente a SIPEEM-DEV. Usa una clave aleatoria nueva, verifica los checksums de los tres archivos seleccionados y ejecuta sus RPC reales en una sola transacción; comprueba el lote ENTIDAD confirmado y revierte con `ROLLBACK`. No ejecuta validación ni publicación y no modifica el journal del importador.

El primer ensayo falló. Una consulta posterior de solo lectura reprodujo `conteo de componente ausente`: el inventario local declaraba NULL para SHX, pero la normalización del servidor exige el conteo para SHP, SHX y DBF. La corrección lee y comprueba la cabecera y longitud real de SHX, compara su número de entradas con SHP/DBF y registra ese conteo. La regresión local pasó de `null !== 0` a verde; también rechaza un SHX con un registro adicional.

Se regeneró el artefacto en un directorio separado, sin sobrescribir el anterior. El nuevo ensayo nativo pasó (1/1), confirmando inicio, las tres RPC de evidencias y la importación real de ENTIDAD 1–1, seguida de rollback. Postflight de lectura: versión 4025 PUBLICADA y predeterminada, carga 1793 COMPLETA, cero claves `ENSAYO_IMPORTADOR_%` persistentes. El rollback no restituye los números de secuencia consumidos.

Suite de todos los archivos `scripts/**/*.test.mjs`: 254 pruebas, 252 aprobadas, dos integraciones optativas omitidas y cero fallos. La integración remota anterior se ejecutó por separado y pasó. ESLint de los tres archivos cambiados: sin errores.

Para repetir voluntariamente este ensayo con un artefacto revisado:

```powershell
$env:SIPEEM_CARTOGRAFIA_DEV_ROLLBACK_TEST = "1"
$env:SIPEEM_CARTOGRAFIA_ARTIFACT = "C:\ruta\artefacto-sellado"
node --test scripts/cartografia/dev-rollback.integration.test.mjs
```

Esto demuestra únicamente el primer lote, no los 86 lotes completos, la validación final, la publicación ni la recuperación del ejecutor entre procesos. Esas puertas siguen pendientes antes de considerar el importador aceptado integralmente.

Revisión independiente: sin hallazgos bloqueantes en la corrección SHX ni en el ensayo de rollback. Hallazgo pendiente de aceptación en el ejecutor general: actualmente confirma checksums por código de salida cero y no conserva ni muestra la respuesta RPC. El servidor puede registrar filas rechazadas sin lanzar una excepción. Antes de avanzar con la carga completa, se debe conservar la respuesta y sus conteos/estado, detenerse ante rechazos y mantener evidencia correcta del lote ya confirmado, sin repetirlo. La validación también debe mostrar el estado remoto para decidir el siguiente paso. No se autoriza una fusión con este punto pendiente.

## Protección de respuestas RPC — 2026-10-02

Se implementó una respuesta verificada por RPC esperada, envoltura de una fila, IDs enteros y, para importación, reconciliación de conteos acumulados y coincidencia capa/cursor cuando el paso declara un rango. Se conserva y muestra la respuesta, incluyendo la fase de validación. Un lote confirmado con rechazos conserva el checksum y activa `review_required`; una respuesta desconocida o fallo conserva evidencia incierta y bloquea los modos mutantes. Antes de lanzar el comando se persiste un marcador pendiente, de modo que una interrupción requiere auditoría antes de continuar.

Las cuatro regresiones iniciales fallaron contra el ejecutor anterior y pasaron tras la corrección. Pruebas adicionales ejercitan la CLI con archivos reales, comprueban el marcador antes del comando y demuestran que una nueva invocación de carga, validación o publicación no ejecuta ningún comando tras el rechazo.

Verificación nativa: una consulta `BEGIN READ ONLY` que devuelve JSON controlado (no llama a una RPC mutante) pasó por el parser y preservó el contador de rechazados; tres pruebas aprobadas. Suite local de scripts final: 264 pruebas, 261 aprobadas, tres optativas omitidas, cero fallos. No se volvió a importar cartografía, no se validó/publicó remotamente ni se modificó PROD en esta etapa. La prueba integral de todas las capas sigue pendiente.

La revisión independiente identificó validación insuficiente del resto del ACK de validación. Se reprodujo y corrigió mediante regresión RED→GREEN: fases cerradas, coherencia fase/completa, contadores procesados/advertencias no negativos, cursor numérico y hash de snapshot válido o NULL. Las respuestas malformadas no levantan el bloqueo. También se comprobaron localmente la validación terminal con errores y el ACK de publicación. Fuera del alcance de esta corrección: aceptación integral, cambios de migraciones/ACL, concurrencia y autorización de publicación. No se fusionó el PR.

## Ensayo integral detenido por transporte — 2026-10-02

Se preparó un directorio aislado `ensayo-integral-20261002` con la clave `ENSAYO_IMPORTADOR_INTEGRAL_20261002` y se ejecutó una sola vez el importador nativo en DEV. Quedaron confirmados inicio, las tres evidencias y ENTIDAD 1–1: versión de ensayo 4037, carga 1795. MUNICIPIO 1–125 recibió HTTP 413 `request entity too large`; el proceso salió con error y dejó `review_required: true`, sin ejecutar el siguiente paso ni reintentar el comando.

Auditoría posterior de solo lectura: carga 1795 CARGANDO, capa ENTIDAD, cursor 1, una fila recibida/insertada, cero rechazadas; cero municipios y cero lotes MUNICIPIO confirmados en el ensayo. La versión publicada 4025 permanece predeterminada y su huella de snapshot conserva exactamente `352f67bb9d36f8d00fe73e0979493ba1e478a4f38365dc7576a75ce954050152` respecto al preflight. No se borró el ensayo: se conserva para conciliación y reanudación controlada.

Causa: el límite anterior se medía sobre JSON antes de Base64. Se redujo el presupuesto predeterminado a 600.000 bytes y se añadió una barrera sobre el tamaño final de la solicitud SQL, con presupuesto local conservador de 900.000 bytes y margen de 4.096. La regresión con texto UTF-8 pasó de fallo a éxito y el ejecutor bloquea también un SQL sellado demasiado grande antes de conectarse.

Se preparó, sin aplicarlo, un nuevo directorio `ensayo-integral-20261002-replan`: 127 pasos de importación, máximo SQL de 800.382 bytes, mismos ocho conteos y recibo compatible. Se copió el estado bloqueado del predecesor; no se levantó `review_required` ni se reintentó la carga. La prueba optativa `transport.integration.test.mjs` verificó todos los checksums y ejecutó únicamente `EXPLAIN (ANALYZE false)` del lote más grande dentro de READ ONLY: pasó 1/1. Esto confirma transporte y planificación, no importación de las geometrías.

Verificación final local: 267 pruebas, 263 aprobadas, cuatro optativas omitidas, cero fallos; ESLint de los archivos cambiados sin errores. El preflight del ejecutor sobre el nuevo artefacto pasó, con 127 pasos previstos y cero ejecutados.

Revisión independiente de la corrección de transporte (`9dc19c1`): sin hallazgos críticos ni importantes. Comprobó los 127 pasos, cero discrepancias de checksum, un máximo de solicitud con margen de 804.501 bytes y ambos journals todavía bloqueados con los mismos tres checksums confirmados. Sus pruebas dirigidas pasaron: 32 aprobadas, dos sondas optativas omitidas, cero fallos. Esta revisión no acepta la carga integral ni implementa la conciliación pendiente.

Pendiente: conciliar expresamente el estado y los rangos del plan nuevo antes de reanudar la carga 1795; ejecutar después las demás capas y la validación controlada. Sin publicación, sin PROD y sin fusión del PR.

## Conciliación explícita y reanudación del ensayo — 2026-10-02

La comparación local verificó todos los checksums SQL de ambos planes, continuidad de rangos y tamaño de los archivos nuevos. Los datos de cada una de las ocho capas, concatenados en orden de fila y resumidos con SHA-256, coinciden exactamente entre los planes. También coinciden el manifiesto, los tres archivos de recibos y los checksums de inicio, recibos y ENTIDAD. Sólo cambia la división de los lotes pendientes; quedan 124 pasos nuevos por ejecutar.

El preflight nativo `reconciliation-preflight.sql` se ejecutó una sola vez en READ ONLY y pasó 10/10 comprobaciones el `2026-10-02T19:15:07.834398+00:00`. Confirmó versión aislada 4037 y carga única 1795, cursor ENTIDAD 1, conteos 1/1/0/0, sólo un lote ENTIDAD en el ledger y cero filas en las capas pendientes. No había incidencias ni progreso de validación. Los tres recibos remotos se compararon por igualdad JSON con los archivos locales y coincidieron. La versión publicada 4025 y su snapshot siguen intactos; carga publicada 1793 COMPLETA.

Huellas de la conciliación:

- SQL de lectura: `ab28b3317c5ddbc13f4aca6967fdb47069e649e27b9328106330ced526bdb7c2`.
- Plan anterior: `712f9ecc1c15d27bcae66834a5266a66f6b1f89a1010f8a1caa3274c0ff7c805`.
- Plan nuevo: `e90c94b125c63dde8a11e5eca7014edc40b5b371934398c389b2b121c62d02f1`.
- Journal bloqueado de origen: `59086b4aa844ba06ae1c2ba33753fff5dfd22de5dbad66e96e6087d5c747472f`.
- Manifiesto local de ambos planes: `08f6d36eb30b0ea69c6c3fd46b1c8aa1d340ae2c6daa396eb214ba79527eb166`.

Decisión operativa: reanudar la misma versión de ensayo con el plan reducido, conservando los tres pasos confirmados. Se añadió exclusivamente al journal nuevo una entrada `READ_ONLY_AUDIT_CONFIRMED_NOT_APPLIED` para el rango MUNICIPIO 1–125 y se levantó su bloqueo después de la auditoría. El journal anterior permanece intacto y bloqueado. No se borraron filas ni evidencias y no se ejecutó nuevamente el SQL anterior que recibió HTTP 413. Esta conciliación es específica del incidente comprobado; no es un desbloqueo genérico de resultados inciertos.

El preflight local posterior pasó: 127 pasos previstos, cero ejecutados y tres checksums por omitir. Se ejecutó una única invocación `--apply` del plan nuevo, exclusivamente en SIPEEM-DEV, sin reintentos automáticos, validación ni publicación. Terminó con código cero: 124 pasos nuevos confirmados, tres omitidos y 127 checksums registrados en total. El último ACK fue LIMITE_LOCALIDAD 1731–1826, con 20.095 recibidos/insertados, cero repetidos y cero rechazados.

El postflight nativo de READ ONLY pasó el `2026-10-02T19:29:29.173107+00:00`. Comprobó los 125 rangos del ledger contra el plan, los conteos por lote y la huella del conjunto ordenado de hashes fuente de cada capa contra los features locales. Volvió a comprobar todos los checksums SQL, los 127 ACK y el journal de origen intacto. Coinciden ENTIDAD 1, MUNICIPIO 125, DISTRITO_LOCAL 45, DISTRITO_FEDERAL 40, SECCION 7.052, COLONIA 7.367, LOCALIDAD 3.639 y LIMITE_LOCALIDAD 1.826.

COLONIA conserva 7.316 polígonos y 51 filas sin geometría. Los límites conservan 1.384 relaciones, 1.327 límites con punto y 499 sin punto; sus dos huellas canónicas coinciden con el recibo aprobado. Los tres hashes de recibos permanecen iguales. No existen incidencias ni progreso de validación para el ensayo.

La versión 4037 y la carga 1795 siguen CARGANDO, sin ser predeterminadas: esto es importación terminada, no validación territorial aprobada. La única versión predeterminada sigue siendo 4025 PUBLICADA, con el mismo snapshot previo y carga 1793 COMPLETA. No hubo publicación, modificaciones de PROD, despliegues manuales ni fusión del PR.

Huellas finales: SQL de postflight `5d967f43c2de985ecfe8572dbf33cb0e06108b18f432b441c21dbbf9fb4089b1`; journal nuevo `b67f1d445f9350296936b6dd2c0ced0d1152ddba1ffafa3fa8116df83c9bb278`. El informe está conservado como `import-postflight-report.json` dentro del artefacto nuevo.

Verificación local renovada: suite de scripts 267 pruebas, 263 aprobadas, cuatro optativas omitidas y cero fallos. La prueba optativa con ambos ZIP reales se ejecutó por separado: 1/1 aprobada, sin consultas ni escrituras remotas.

Siguiente puerta: revisar y adaptar la invocación de validación al checkpoint esperado de `rpc_validar_version_cartografica_paso_exacto` antes de ejecutarla. El SQL generado actualmente llama directamente a `rpc_validar_version_cartografica_lote`; la importación comprobada aquí no acepta ese flujo ni demuestra su protección frente a deriva/replay. Una consulta de catálogo de READ ONLY confirmó las firmas instaladas y que `service_role` tiene EXECUTE en el paso exacto, pero no en la RPC base. La aceptación integral y cualquier publicación siguen pendientes.

## Checkpoint exacto e inicio de validación — 2026-10-02

Se sustituyó la invocación directa por un único paso sellado de `rpc_validar_version_cartografica_paso_exacto`. La preparación offline deja la etapa de validación vacía. La CLI exige `--artifact` y `--checkpoint`; comprueba DEV, clave e ID de versión, fase, cursor cerrado y snapshot. El SQL queda identificado por su SHA-256 y no se sobrescribe. El ejecutor compara su contenido con el checkpoint, rechaza planes legacy o con más de un paso y bloquea la repetición de un checksum ya confirmado antes de abrir Supabase.

El ACK debe coincidir con versión y snapshot, tener contadores válidos y demostrar avance compatible de fase/cursor. Los errores terminales se conservan como evidencia confirmada y bloquean la continuación; un ACK desconocido conserva el estado incierto. El checkpoint esperado se registra tanto antes del transporte como en la confirmación o fallo. No se añadió un bucle automático de validación ni reintentos.

Las regresiones iniciales reprodujeron los fallos antes de la corrección. Se añadieron pruebas de esquema cerrado, hash no textual, ACK legacy, falta de avance, salto de fase, SQL distinto del checkpoint, planes múltiples, estado incierto y replay a través de la CLI con archivos reales. Suite renovada: 275 pruebas, 271 aprobadas, cuatro integraciones optativas omitidas, cero fallos. ESLint de los nueve archivos de código/pruebas cambiados pasó. La integración local con ambos ZIP reales volvió a pasar por separado (1/1), sin consultas ni escrituras remotas.

Revisión independiente: cero hallazgos críticos o importantes. El hallazgo menor de documentación se atendió actualizando el runbook con el archivo de checkpoint, sus campos, refresco desde READ ONLY y prohibición del SQL legacy. La revisión no aceptó un bucle completo, concurrencia, publicación ni cambios de PROD; esas áreas no se alteraron.

Se planificó el SQL exacto de inicio mediante una única ejecución nativa de `EXPLAIN (ANALYZE false, FORMAT JSON)` dentro de READ ONLY con rollback. El preflight nativo posterior pasó 10/10 comprobaciones el `2026-10-02T20:22:57.4451+00:00`: ensayo aislado 4037/carga 1795, importación completa, snapshot esperado, cero progreso/incidencias y ACL restringidas. La versión publicada 4025, su snapshot y carga 1793 seguían intactos.

Después se ejecutó **una sola invocación mutante** de `--validate`, con `checkpoint-001.json`: fase esperada SIN_INICIAR, cursor vacío y snapshot `559d9ed48f1a9ca0eaee99bc18938c186def2bf06762bd17ec1b932992ccc7dd`. El ACK confirmó PADRES, cursor `{"cartografia_seccion_id":0}`, cero errores, 51 advertencias, cero secciones procesadas y `completa: false`. Esto inició la validación; no ejecutó el primer lote de parentesco espacial.

El postflight nativo de READ ONLY pasó 14/14 comprobaciones el `2026-10-02T20:26:18.615417+00:00`. La carga 1795 quedó VALIDANDO; la versión 4037 sigue CARGANDO y no predeterminada. Coinciden fase/cursor/snapshot persistidos y los ocho conteos fuente. Las 51 incidencias son exclusivamente ADVERTENCIA/GEOMETRIA_NULA_ORIGEN/COLONIA y corresponden a las 51 filas originales sin geometría. No existen errores. El ledger mantiene 125 rangos y 20.095 recibidos/insertados, sin repetidos ni rechazados. La RPC base sigue sin EXECUTE para service_role y el paso exacto sigue restringido. La única versión predeterminada continúa siendo 4025 PUBLICADA, con snapshot inalterado y carga 1793 COMPLETA.

Una comprobación local posterior intentó el mismo checkpoint usando un transporte simulado prohibido: el ejecutor lo rechazó como ya confirmado y realizó cero llamadas. El journal quedó idéntico durante esta comprobación. Conserva 127 checksums de importación, una validación confirmada, `review_required: false` y `publication_confirmed: false`; el journal bloqueado de origen y el plan de importación permanecen intactos.

Huellas de esta etapa:

- SQL de EXPLAIN: `1a27f199fd427d06036b3f2d5c2098c00ff41d2348409af7e76edc471c8d7d3f`.
- SQL de preflight: `4b138df26f4788595d1f204004d65e8ec2199d45d957f597f4cb6b277d32d95a`.
- SQL del paso ejecutado: `fb7926de60252575b3cfbd9d29dca7d87825d078f908ea24999f749083939580`.
- SQL de postflight: `171248cb3f532cc53e7c98dd29f54a545f4c4558710c074161fca5e6a272bba4`.
- Journal después del paso: `34141b732a5065f48000dc8dd1127808d05e1ca405c13d63cf97374833e0bf13`.

Los informes `validation-preflight-report-001.json` y `validation-postflight-report-001.json`, el SQL sellado y `checkpoint-002.json` se conservaron dentro del artefacto replanteado. El segundo checkpoint se preparó a partir del postflight, pero no se ejecutó: antes de usarlo se debe volver a contrastar el estado remoto. El siguiente paso es PADRES, por lotes de hasta 250 secciones, sin repetir el inicio. Quedan pendientes SOLAPES, COBERTURA, CONTEOS y la aceptación integral. No hubo publicación, cambios de PROD, despliegues manuales ni fusión del PR.

## Fase PADRES completa — 2026-10-02

Se continuó el mismo ensayo 4037/carga 1795 exclusivamente en SIPEEM-DEV. El preflight nativo de READ ONLY repitió 14/14 controles el `2026-10-02T20:38:54.93501+00:00`, confirmando PADRES/cursor cero, snapshot intacto, 51 advertencias y ningún error. Las pruebas dirigidas del ejecutor, parser y checkpoint pasaron: 25 aprobadas y una sonda opcional omitida.

Decisión operativa: agrupar únicamente PADRES para continuar el plan aprobado sin pedir autorización por cada lote. No se añadió un bucle a la CLI ni se cambió código de producto: cada lote fue una invocación nativa independiente del comando existente, con SQL exacto sellado y checkpoint contrastado. La orquestación tuvo un límite de 29 lotes para las 7.052 secciones; ningún fallo se reintenta y ningún checkpoint esperado SOLAPES se ejecuta en este bloque.

El primer lote, con `checkpoint-002.json`, procesó 250 secciones y terminó en PADRES/cursor 9359, cero errores y 146 advertencias. Su postflight de READ ONLY confirmó el ACK, datos, ledger, ACL y publicación intactos. De las advertencias, 51 corresponden a COLONIA sin geometría y 95 a pertenencia espacial de SECCION. Las muestras conservadas muestran áreas fuera del padre inferiores al umbral del validador; no se corrigieron geometrías ni se aceptaron advertencias para publicación.

Después se encadenaron 28 invocaciones nativas adicionales, con `checkpoint-003.json` hasta `checkpoint-030.json`. Antes de cada una se contrastó el checkpoint remoto recién observado con el último ACK local confirmado; después de cada una se ejecutó exactamente una consulta de READ ONLY desde el archivo sellado `validation-observe-parents.sql`. Sus resultados se conservaron como `validation-postflight-report-NNN.json`. Se comprobaron fase/cursor, snapshot, conteo acumulado de secciones, contadores del ACK, incidencias, conteos de las ocho capas, ledger, estados de carga/versión, permisos efectivos de las dos RPC y la versión publicada. Diez sondas locales negativas comprobaron que las discrepancias del control operacional son rechazadas antes de ese encadenamiento.

Resultado: 29 lotes PADRES confirmados, 28 de 250 secciones y uno de 52; total 7.052 secciones procesadas, cero errores. El último ACK avanzó a SOLAPES con cursor `{"cartografia_seccion_id":0}`, `completa: false` y 1.659 advertencias. El postflight final, el `2026-10-02T20:53:05.151328+00:00`, confirmó ese estado. Las incidencias se reconcilian exactamente: 51 ADVERTENCIA/GEOMETRIA_NULA_ORIGEN/COLONIA y 1.608 ADVERTENCIA/PERTENENCIA_ESPACIAL_NO_COINCIDE/SECCION. Se conservan para revisión; no equivalen a errores ni a autorización de publicación.

La versión de ensayo permanece CARGANDO y no predeterminada; su carga sigue VALIDANDO. El snapshot conserva `559d9ed48f1a9ca0eaee99bc18938c186def2bf06762bd17ec1b932992ccc7dd`. El ledger mantiene 125 rangos, 20.095 recibidos/insertados y cero repetidos/rechazados. Los ocho conteos fuente permanecen iguales. La única versión predeterminada sigue siendo 4025 PUBLICADA, con snapshot `352f67bb9d36f8d00fe73e0979493ba1e478a4f38365dc7576a75ce954050152` y carga 1793 COMPLETA. La RPC exacta continúa restringida y la base permanece sin EXECUTE para service_role. PostgreSQL observado: 17.6; no se realizaron actualizaciones ni mantenimiento de índices.

La auditoría local de cierre verificó los 30 checksums SQL de validación y sus 30 informes de lectura, la cadena de fase/cursor de todos los ACK, los 29 lotes PADRES y su suma exacta de 7.052. El journal tiene 30 validaciones confirmadas (incluido el inicio anterior), conserva 127 checksums de importación, `review_required: false` y `publication_confirmed: false`. Un intento simulado de repetir `checkpoint-030.json` se rechazó localmente con cero llamadas de transporte y sin alterar el journal. El plan de importación y el journal bloqueado de origen siguen byte a byte intactos.

Huellas de cierre:

- SQL de observación de fase: `6300495dd1e8abeb9eb1483e69ecda0eef0f3525b6cd53cc6ef074137cb4c5dd`.
- SQL del primer lote PADRES: `19c2d61cfbf95bad0962e401c38bdb8ae827a3cdc939cd257db31cd10780ce9b`.
- SQL del último lote PADRES: `ecdf22b80d6cc4023280ecbcf20e2771b7c6acd40e38a31dd81f9304766fbda6`.
- Journal final: `c854352b20aad4dfd74e6d030d2df7c21f4b3e9cbaaa7ec1f731fc03d6dfae52`.

La suite completa de scripts volvió a pasar: 275 pruebas, 271 aprobadas, cuatro integraciones opcionales omitidas y cero fallos. Esta etapa no cambió código de producto ni migraciones. El informe de la agrupación se conservó como `parents-phase-execution-report.json`; `checkpoint-031.json` contiene el siguiente estado SOLAPES/cursor cero y no se ejecutó. Para retomarlo hay que renovar primero el preflight de READ ONLY y contrastarlo con el último ACK, sin repetir PADRES. Quedan pendientes SOLAPES, COBERTURA, CONTEOS y la aceptación integral. Sin publicación, sin PROD, sin despliegues manuales ni fusión del PR.

## Fase SOLAPES completa — 2026-10-02

Se continuó exclusivamente el ensayo 4037/carga 1795 en SIPEEM-DEV. La primera consulta de preflight de READ ONLY falló con HTTP 400/SQLSTATE 42601, antes de llamar a cualquier RPC mutante. La generación de su expresión regular utilizó una sustitución textual de JavaScript que interpretó el fragmento literal `$'` como sufijo de reemplazo y duplicó parte del SQL. Se preservó el archivo fallido `validation-observe-overlaps.sql` y no se volvió a ejecutarlo. Una reproducción mínima RED→GREEN comprobó que una función de reemplazo conserva el patrón literalmente. Se creó un archivo separado corregido, `validation-observe-overlaps-v2.sql`; no hubo reintento automático ni cambios de código de producto. El incidente se conserva en `overlaps-readonly-preflight-failure.json`.

El preflight nativo corregido pasó el `2026-10-02T21:36:42.498971+00:00`: SOLAPES/cursor cero, cero errores, 1.659 advertencias y datos, ledger, snapshots, carga, publicación y permisos intactos. Se conservó como `validation-preflight-report-031.json`. Las pruebas dirigidas volvieron a pasar: 26 pruebas, 25 aprobadas, una sonda optativa omitida y cero fallos. Catorce sondas negativas locales comprobaron el rechazo de discrepancias del control operacional.

Decisión operativa: agrupar solamente SOLAPES, con un límite cerrado de 29 llamadas y parada obligatoria al avanzar a COBERTURA. Cada lote fue una invocación nativa independiente de la CLI existente, con checkpoint y SQL exactos sellados; no se añadió un bucle a la CLI ni reintentos. Se ejecutaron `checkpoint-031.json` hasta `checkpoint-059.json`. Antes de cada paso se contrastó el último ACK local con el estado remoto recién observado; después de cada paso se ejecutó exactamente una consulta nativa de READ ONLY desde el archivo corregido. Los 29 postflights quedaron conservados como `validation-postflight-report-031.json` hasta `validation-postflight-report-059.json`.

En cada postflight se comprobaron fase/cursor, snapshot, secciones acumuladas, contadores e incidencias, las ocho capas, ledger, estados de carga/versión, ACL y versión publicada. También se reconciliaron todas las áreas de solape registradas: detalle parseable, área positiva y ninguna superior al umbral de 1 m²; las advertencias previas de PADRES permanecieron exactamente iguales.

Resultado: 29 lotes SOLAPES confirmados, 28 de 250 secciones y uno de 52; total 7.052 secciones comprobadas, cero errores. Se registraron 3.249 pares con solape positivo como ADVERTENCIA/SOLAPE_SECCIONES/SECCION. Área mínima observada: `1.76182853028894e-19 m²`; máxima: `0.539622644076177 m²`. Cero detalles malformados, cero áreas no positivas y cero áreas superiores a 1 m². No se corrigieron geometrías ni se aceptaron las advertencias para publicación.

El último ACK y el postflight del `2026-10-02T21:47:24.787237+00:00` confirmaron COBERTURA/cursor `{"cartografia_municipio_id":0}`, cero errores, 4.908 advertencias y `completa: false`. Las incidencias se reconcilian exactamente: 51 GEOMETRIA_NULA_ORIGEN/COLONIA, 1.608 PERTENENCIA_ESPACIAL_NO_COINCIDE/SECCION y 3.249 SOLAPE_SECCIONES/SECCION, todas ADVERTENCIA. No se ejecutó ningún checkpoint esperado COBERTURA.

La versión de ensayo sigue CARGANDO y no predeterminada; la carga 1795 continúa VALIDANDO. El snapshot conserva `559d9ed48f1a9ca0eaee99bc18938c186def2bf06762bd17ec1b932992ccc7dd`. El ledger mantiene 125 rangos, 20.095 recibidos/insertados y cero repetidos/rechazados; los ocho conteos fuente permanecen iguales. La única versión predeterminada sigue siendo 4025 PUBLICADA, con snapshot `352f67bb9d36f8d00fe73e0979493ba1e478a4f38365dc7576a75ce954050152` y carga 1793 COMPLETA. El paso exacto conserva EXECUTE exclusivamente para service_role entre los roles API comprobados; la RPC base continúa sin EXECUTE para service_role. Sin cambios de esquema, ACL ni mantenimiento de índices.

La auditoría offline de cierre comprobó los 59 ACK de validación confirmados, sus 59 archivos SQL contra checksum y contenido regenerado desde checkpoint, sus 59 informes de lectura y la cadena completa de fase/cursor. Los 29 ACK SOLAPES suman exactamente 7.052 secciones. El conjunto de 127 checksums de importación coincide exactamente con el plan. Reconstruir el journal previo a SOLAPES produce el mismo hash anterior `c854352b20aad4dfd74e6d030d2df7c21f4b3e9cbaaa7ec1f731fc03d6dfae52`. El plan, el journal bloqueado de origen y el SQL de lectura fallido permanecen intactos. Un replay simulado de `checkpoint-059.json` se rechazó como ya confirmado con cero llamadas de transporte y sin modificar el journal.

El journal final conserva 59 validaciones confirmadas, 127 checksums de importación, `review_required: false` y `publication_confirmed: false`. Huellas de cierre:

- SQL de lectura fallido preservado: `481391022d407cc753218d679ce924fdef06c5b5b74b747029f2babb3b4f8aa7`.
- SQL de observación corregido: `dc543c5c323b7e9f68aebb09c0ed5fea388165d0054c2c8eee2421c35cbb00d3`.
- SQL del primer lote SOLAPES: `9a5b486042fedb6e639bfc3d35f127e4daa2b2f59fd633237d399225b9936ab8`.
- SQL del último lote SOLAPES: `8d993de3d2430fec9c13a31bed0b124b64081bc1040bcd4379a61e3b2eeb90fd`.
- Journal final: `080ce62ea35f9403c76f2e1504ddf90faea0264e6ceec0e268ed44323ebc763f`.

La suite completa de scripts renovada pasó: 275 pruebas, 271 aprobadas, cuatro integraciones optativas omitidas y cero fallos. El resultado operativo y la auditoría se conservaron como `overlaps-phase-execution-report.json` y `overlaps-phase-integrity-report.json`. `checkpoint-060.json` contiene COBERTURA/cursor cero, coincide con el último ACK y no se ejecutó. Antes de retomarlo hay que renovar el preflight de READ ONLY; quedan pendientes COBERTURA, CONTEOS y la aceptación integral. Esta etapa no cambió código de producto ni migraciones. Sin publicación, sin PROD, sin despliegues manuales ni fusión del PR.

## Fase COBERTURA completa — 2026-10-02

Se continuó exclusivamente el ensayo 4037/carga 1795 en SIPEEM-DEV, sin repetir PADRES ni SOLAPES. El preflight nativo de READ ONLY del `2026-10-02T22:08:30.886483+00:00` confirmó COBERTURA/cursor cero, cero errores, 4.908 advertencias y ningún incidente de cobertura. Se contrastaron el último ACK, los 127 checksums de importación, el plan y el journal bloqueado de origen. El journal previo conservaba exactamente `080ce62ea35f9403c76f2e1504ddf90faea0264e6ceec0e268ed44323ebc763f`. El preflight se preservó como `validation-preflight-report-060.json`.

Decisión operativa: el contrato instalado procesa un municipio por llamada en COBERTURA, independientemente de que el SQL indique lote 250. Se fijó un máximo cerrado de 125 llamadas, una por municipio, con parada al avanzar a CONTEOS y sin llamada vacía adicional. El runbook se aclaró para reflejar esta diferencia respecto a PADRES/SOLAPES. No se modificó el validador ni el importador.

Las pruebas dirigidas renovadas pasaron: 26 pruebas, 25 aprobadas, una sonda optativa omitida y cero fallos. Se comprobaron 33 casos negativos locales del control de observación: proyecto/SQL incorrectos, deriva de datos o publicación, ACL, fase/cursor, contadores, áreas superiores al umbral, detalle ilegible, incidencia duplicada o de otro municipio y avance incorrecto. La planificación operativa y estos resultados se conservaron en el artefacto.

Se ejecutaron 125 invocaciones nativas independientes de `--validate`, con `checkpoint-060.json` hasta `checkpoint-184.json`. Cada una llamó una sola vez a la RPC exacta. Antes de cada paso se contrastó el último ACK con el postflight remoto recién observado y el municipio siguiente; después de cada paso se ejecutó exactamente una consulta nativa de READ ONLY desde `validation-observe-coverage.sql`. Se conservaron los 125 postflights. No hubo reintentos automáticos, resultados inciertos ni errores remotos.

Los controles verificaron un municipio procesado por ACK, cursor igual al ID del municipio observado, acumulado exacto, snapshot, fase, incidencias, capas, ledger, carga/versión, ACL y versión publicada. Los incidentes anteriores de PADRES/SOLAPES quedaron idénticos; las incidencias de cobertura previas también se preservaron íntegramente entre pasos.

Resultado: 125 municipios distintos comprobados, cero errores y 124 ADVERTENCIA/HUECO_MUNICIPAL/MUNICIPIO; un municipio no generó incidencia de hueco. Todas las áreas positivas están dentro del umbral municipal del validador, `greatest(100 m², 0.00001 × área municipal)`. La mínima registrada es `0.00000108669409255711 m²` en municipio 023; la máxima es `4.04464298942908 m²` en municipio 106, cuyo umbral es `8010.33718042715 m²`. Cero detalles malformados, cero áreas no positivas, cero áreas superiores a su umbral y cero discrepancias de severidad. No se corrigieron geometrías ni se aceptaron las advertencias para publicación.

El último ACK y su postflight del `2026-10-02T22:47:33.359098+00:00` confirmaron CONTEOS/cursor vacío, cero errores, 5.032 advertencias y `completa: false`. El total se reconcilia exactamente: 51 GEOMETRIA_NULA_ORIGEN/COLONIA, 1.608 PERTENENCIA_ESPACIAL_NO_COINCIDE/SECCION, 3.249 SOLAPE_SECCIONES/SECCION y 124 HUECO_MUNICIPAL/MUNICIPIO, todas ADVERTENCIA. No se ejecutó ningún checkpoint esperado CONTEOS.

La versión 4037 permanece CARGANDO y no predeterminada; la carga 1795 sigue VALIDANDO. Su snapshot conserva `559d9ed48f1a9ca0eaee99bc18938c186def2bf06762bd17ec1b932992ccc7dd`. Los ocho conteos y el ledger permanecen iguales: 125 rangos, 20.095 recibidos/insertados y cero repetidos/rechazados. La única versión predeterminada sigue siendo 4025 PUBLICADA, con snapshot `352f67bb9d36f8d00fe73e0979493ba1e478a4f38365dc7576a75ce954050152` y carga 1793 COMPLETA. La RPC exacta continúa restringida entre los roles API comprobados, y la base sigue sin EXECUTE para service_role. PostgreSQL observado: 17.6; sin cambios de esquema/ACL, actualización ni mantenimiento de índices.

La primera auditoría offline de cierre se detuvo al leer el informe histórico 001: éste guarda `progress` en el nivel superior y 14 controles, mientras que los informes siguientes usan `report.progress`. Fue un fallo de lectura local, no una llamada a Supabase. Se reprodujo con una aserción RED y se añadió únicamente a la auditoría operativa la lectura explícita del formato original del paso 001, exigiendo proyecto, hash y 14/14 controles. Los informes posteriores siguen exigiendo la envoltura; cinco regresiones pasaron GREEN, incluyendo el rechazo de formatos ausentes o controles falsos. No se modificaron informes históricos ni se repitió ninguna llamada remota.

La auditoría de cierre renovada pasó: los 184 ACK confirmados coinciden con sus checkpoints, hashes SQL, contenido regenerado y respectivos informes de lectura. La cadena completa de fase/cursor coincide; los 125 ACK COBERTURA suman 125 municipios únicos. Los 127 archivos SQL de importación y sus checksums siguen coincidiendo con el plan. Reconstruir el journal previo a COBERTURA devuelve exactamente su hash anterior; el journal bloqueado de origen y el plan permanecen intactos. Un replay simulado del último checkpoint se rechazó antes del transporte, con cero llamadas y sin modificar el journal.

Huellas de cierre:

- SQL de observación de cobertura: `d68edf9fc1060b1d049df01f202ace2f1895a7ffba353952bc2492a3a04e4a38`.
- SQL del primer municipio: `0fe1d8a7a734b9bd67971a2badf786806ab79980409c6ad0e9148aec31a1a0cf`.
- SQL del último municipio: `ecf164f2c016511df8ef5cd5d28ec0cfd5f84f8c79cd751b686541155ddf49d3`.
- Journal final: `7d7c3f428bab968a4052a8ad1a9aa0422881e2bc0d5f5690f3cab65b451ad507`.

El journal conserva 184 validaciones confirmadas, 127 checksums de importación, `review_required: false` y `publication_confirmed: false`. La suite completa de scripts renovada pasó: 275 pruebas, 271 aprobadas, cuatro integraciones optativas omitidas y cero fallos. Los informes `coverage-phase-execution-report.json` y `coverage-phase-integrity-report.json` y la auditoría operativa se conservaron dentro del artefacto. `checkpoint-185.json` contiene CONTEOS/cursor vacío, coincide con el último ACK y no se ejecutó. Antes de retomarlo hay que renovar el preflight de READ ONLY. Quedan pendientes CONTEOS y la aceptación integral. Sin cambios de código de producto o migraciones, sin publicación, sin PROD, sin despliegues manuales ni fusión del PR.

## CONTEOS y cierre del ensayo de importación/validación — 2026-10-02

Se continuó exclusivamente el ensayo 4037/carga 1795 en SIPEEM-DEV. Antes de ejecutar se repitió el preflight nativo de READ ONLY, el `2026-10-02T23:22:42.498318+00:00`: CONTEOS/cursor vacío, cero errores, 5.032 advertencias, snapshot y ocho conteos sellados idénticos. La auditoría histórica de COBERTURA pasó nuevamente antes de avanzar. Veintiocho casos negativos locales comprobaron el rechazo de discrepancias del control terminal, sin llamadas remotas.

Se ejecutó una única invocación nativa `--validate` con `checkpoint-185.json`, sin reintentos automáticos. El ACK confirmó `COMPLETA`, `completa: true`, ocho capas comprobadas, cursor vacío, cero errores y 5.032 advertencias. El postflight de READ ONLY del `2026-10-02T23:28:51.146161+00:00` confirmó versión 4037 `VALIDADA`, no predeterminada; carga 1795 `COMPLETA`, no reanudable, sin código ni detalle de fallo, y fechas de finalización presentes. Los conteos esperados, validados, fuente y snapshot coinciden. COMPLETA es terminal: no se generó otro checkpoint ejecutable ni se llamó de nuevo al validador.

Los datos se mantienen íntegros: ENTIDAD 1, MUNICIPIO 125, DISTRITO_LOCAL 45, DISTRITO_FEDERAL 40, SECCION 7.052, COLONIA 7.367, LOCALIDAD 3.639 y LIMITE_LOCALIDAD 1.826; total 20.095 registros, todos recibidos/insertados, cero repetidos/rechazados. Se conservan 7.316 polígonos de colonia y 51 filas sin geometría, 1.384 relaciones localidad-límite, 1.327 límites con punto y 499 sin punto. Las huellas de los grafos y de los recibos aprobados permanecen iguales.

El postflight integral renovado, `2026-10-02T23:29:48.154214+00:00`, contrastó los 125 rangos remotos con el plan sellado y sus conteos. La auditoría reconstruyó los conjuntos ordenados de hashes fuente de las ocho capas directamente desde los payloads Base64 de los 125 SQL de geometrías y los comparó con las huellas remotas: coincidencia exacta en todas las capas y con el postflight de importación anterior. Los tres archivos locales de recibos coinciden con los payloads SQL sellados; sus hashes de JSONB canónico coinciden con los tres recibos remotos. El manifiesto de inicio conserva los hashes de los ZIP originales.

Las incidencias permanecieron exactamente iguales al preflight, todas ADVERTENCIA:

- 51 GEOMETRIA_NULA_ORIGEN/COLONIA.
- 1.608 PERTENENCIA_ESPACIAL_NO_COINCIDE/SECCION.
- 3.249 SOLAPE_SECCIONES/SECCION.
- 124 HUECO_MUNICIPAL/MUNICIPIO.

No se corrigieron geometrías ni se aceptaron advertencias para publicación. Se conservaron los controles y detalles espaciales anteriores: áreas de solape positivas menores de 1 m² y huecos dentro del umbral municipal, sin detalles malformados, áreas no positivas o discrepancias de severidad.

La auditoría offline final verificó 185 ACK confirmados: un inicio SIN_INICIAR, 29 PADRES, 29 SOLAPES, 125 COBERTURA y un CONTEOS. Los 185 checkpoints, archivos SQL, checksums, contenido regenerado e informes de lectura coinciden; la cadena de fase/cursor es íntegra. El informe histórico 001 se sigue leyendo en su formato original, exigiendo 14/14 controles. Una primera aserción local del recuento llamó erróneamente INICIAL al primer checkpoint; el contrato y el archivo histórico confirman SIN_INICIAR. La comprobación falló antes del transporte, se corrigió únicamente esa etiqueta en la auditoría local y pasó íntegramente. No se alteró evidencia histórica ni se repitió una ejecución remota.

Los 127 checksums de importación siguen coincidiendo con sus archivos y el plan. Reconstruir el journal previo a CONTEOS devuelve exactamente `7d7c3f428bab968a4052a8ad1a9aa0422881e2bc0d5f5690f3cab65b451ad507`. El plan y el journal bloqueado de origen permanecen byte a byte intactos. Un replay simulado del checkpoint 185 fue rechazado como ya confirmado antes de abrir Supabase: cero llamadas de transporte y journal sin cambios. El journal final tiene 185 validaciones confirmadas, `review_required: false` y `publication_confirmed: false`; la ausencia de bloqueo técnico no acepta las advertencias para publicación.

La única versión predeterminada continúa siendo 4025 PUBLICADA, con snapshot `352f67bb9d36f8d00fe73e0979493ba1e478a4f38365dc7576a75ce954050152` y carga 1793 COMPLETA. El snapshot del ensayo conserva `559d9ed48f1a9ca0eaee99bc18938c186def2bf06762bd17ec1b932992ccc7dd`. La RPC exacta continúa restringida a service_role entre los roles API comprobados; la base sigue sin EXECUTE para service_role. No se cambiaron esquema, ACL ni índices.

Huellas de cierre:

- SQL del único paso CONTEOS: `94b45ca051d31a58b4a7534ccc4ba16b0702da9b5f9602fac1c02319c8208522`.
- SQL del observador terminal: `8ffacf698c5e5389a3903eb57e431e3620a895344f69e414f063495d4774c439`.
- SQL del postflight integral: `5d967f43c2de985ecfe8572dbf33cb0e06108b18f432b441c21dbbf9fb4089b1`.
- Journal final: `07f7619c4671520a3d9c95bfd21ef219614d8c2cb211b9b48e669683511b8c4c`.

Verificación local renovada: todos los 48 archivos de pruebas de scripts, 275 pruebas, 271 aprobadas, cuatro integraciones optativas omitidas y cero fallos. Se ejecutó por separado la regresión optativa con los dos ZIP originales del INE: una prueba aprobada, cero omitidas/fallos y cero llamadas remotas. Reprodujo los hashes aprobados, ocho conteos, continuidad/presupuesto de los lotes y grafos localidad-límite.

La evidencia queda en el artefacto replanteado: `counts-phase-execution-report.json`, preflight/postflight 185, `integral-readonly-postflight-report.json`, `integral-closure-audit.mjs`, `integral-integrity-report.json`, ambos informes de pruebas e `integral-acceptance-report.json`. Alcance aceptado: **importación y validación del paquete aprobado en el ensayo aislado de DEV, con advertencias conservadas**. No es aceptación de publicación, de concurrencia ni del paquete nuevo de noviembre; tampoco declara terminado todo el Subplan 1. Siguiente puerta: revisar las advertencias y la evidencia del PR antes de decidir fusión o publicación separada. Sin cambios de código de producto/migraciones, sin publicación, sin PROD, sin despliegues manuales ni fusión del PR.

Revisión independiente del cierre, exclusivamente local y de solo lectura: sin hallazgos críticos, importantes ni menores. Recalculó los 185 checkpoints/ACK/SQL/informes, 127 checksums, 125 rangos, ocho digests fuente y tres digests de recibos; confirmó la única pareja inicio/ACK de CONTEOS, ausencia de checkpoint 186, journals intactos y advertencias sin cambios. No repitió las suites ni hizo llamadas remotas. Dictamen limitado: listo para registrar este cierre documental, no para fusionar/publicar/desplegar el PR completo. El informe está en `integral-independent-review-report.json`. Conservar el directorio del artefacto sellado: sus archivos están ignorados por Git y son necesarios para reproducir la auditoría.
