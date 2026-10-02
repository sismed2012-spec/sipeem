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
