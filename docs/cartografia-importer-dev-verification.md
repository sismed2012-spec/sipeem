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
