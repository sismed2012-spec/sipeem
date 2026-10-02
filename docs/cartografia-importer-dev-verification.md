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
