# Cartografía INE versionada: preflight, carga y reseccionamiento

Este flujo incorpora MGS y BGD como una versión nueva. Nunca reemplaza ni borra la versión cartográfica anterior. El modo predeterminado es únicamente de preflight local.

## 1. Preparar e inspeccionar

En PowerShell, desde la raíz del repositorio:

```powershell
npm.cmd run cartografia:preflight -- `
  --mgs "C:\ruta\mgs_15_Shapefile.zip" `
  --bgd "C:\ruta\bgd_15_Shapefile.zip" `
  --version-key "INE_EDOMEX_2026_RESECCIONAMIENTO" `
  --version-name "INE Estado de México 2026 reseccionamiento" `
  --expected-date "2026-11-12"
```

El comando fija e inventaría los archivos, verifica conteos y proyección, exige codificación explícita, compara las cinco capas comunes de MGS y BGD, normaliza las ocho capas y genera lotes SQL. No abre una conexión a Supabase.

El resultado queda en `.artifacts/cartografia/<artifact_id>/`:

- `preflight.json`: huellas, conteos y compatibilidad con el contrato instalado;
- `manifest.json`: componentes y política de cada capa;
- `receipts/`: evidencia inmutable de codificación, colonias y límites de localidad;
- `plan.json`: pasos ordenados y sus checksums;
- `sql/`: un archivo por paso, sin secretos.

No continuar si `database_compatibility.applyAllowedByCurrentSchema` es `false`. Para un paquete nuevo, ese resultado significa que primero deben aprobarse una migración aditiva que registre sus nuevos hashes, conteos y relaciones y la actualización correspondiente del contrato revisado en el importador. No se debe desactivar ni eludir esa barrera.

## 2. Cargar sólo en SIPEEM-DEV

Después de revisar el artefacto:

```powershell
npm.cmd run cartografia:import -- `
  --artifact ".artifacts\cartografia\<artifact_id>" `
  --project-ref "nppvprbfmjbhwheghipa"
```

La ejecución acepta exclusivamente el project ref de SIPEEM-DEV. Cada lote confirmado se guarda en `execution-state.json`; al reanudar un estado confirmado sin bloqueos, se omiten esos checksums. No hay reintentos automáticos. Una interrupción con un paso pendiente exige revisar el estado remoto antes de reanudar.

Cada comando guarda un marcador pendiente **antes** de abrir Supabase. Al recibir una respuesta RPC verificable, registra sus IDs, conteos y estado, además del checksum confirmado, y muestra la respuesta en consola. Un código de salida cero por sí solo ya no confirma el lote.

Si aparecen `rechazados > 0` o errores de validación, el paso confirmado permanece registrado y el proceso se detiene con `REVIEW_REQUIRED`: no se repite el lote ni se ejecuta el siguiente. Una respuesta ilegible, fallo del comando o interrupción deja el resultado como incierto y conserva el bloqueo. Todos los modos mutantes quedan bloqueados incluso después de reiniciar; el preflight local sigue disponible. La reanudación requiere una auditoría del ledger remoto y una conciliación explícita de la evidencia local. No borrar `execution-state.json`, no quitar el bloqueo a ciegas ni generar un artefacto nuevo para eludirlo.

El orden es: inicio de carga, recibos inmutables, entidad, municipios, distritos locales, distritos federales, secciones, colonias, localidades y límites de localidad. Los lotes tienen como máximo 250 filas y un límite de tamaño UTF-8.

El presupuesto predeterminado es 600.000 bytes de JSON de features. Después de codificar a Base64 se verifica también el SQL dentro de la envoltura JSON de transporte: como política local conservadora, 900.000 bytes incluyendo 4.096 bytes de margen. El generador y el ejecutor rechazan archivos que excedan ese presupuesto antes de llamar a Supabase. No representa una garantía ni una declaración del límite exacto del proveedor. Si falla una solicitud por tamaño, auditar primero el ledger remoto y replanificar en un directorio separado; conservar el bloqueo y la evidencia hasta completar la conciliación.

## 3. Validar

La preparación local deja `plan.validate` vacío: no puede anticipar un checkpoint remoto. Cada invocación exige un archivo JSON obtenido de una auditoría de READ ONLY en DEV, con `schema_version: 1`, `project_ref`, `version_key`, `cartografia_version_id`, `fase`, `cursor` y `snapshot_sha256`. No inventar IDs, cursor ni huella, y no usar la respuesta local anterior sin contrastarla con el estado remoto.

La fase inicial es `SIN_INICIAR` con cursor `{}` y la huella actual de `snapshot_cartografia_version`. Después se usan la fase, cursor y huella persistidos en `validaciones_cartograficas_progreso`. Los checkpoints admitidos son SIN_INICIAR, PADRES, SOLAPES, COBERTURA y CONTEOS; COMPLETA es terminal y no se ejecuta de nuevo. PADRES/SOLAPES requieren `cartografia_seccion_id`; COBERTURA, `cartografia_municipio_id`; SIN_INICIAR/CONTEOS, cursor vacío.

```powershell
npm.cmd run cartografia:validate -- `
  --artifact ".artifacts\cartografia\<artifact_id>" `
  --project-ref "nppvprbfmjbhwheghipa" `
  --checkpoint ".artifacts\cartografia\<artifact_id>\checkpoint-001.json"
```

Cada invocación sella un único SQL inmutable `sql/validation-<sha256>.sql` y llama exclusivamente a `rpc_validar_version_cartografica_paso_exacto`, con lote 250. La versión se busca por clave **e ID esperado**, excluyendo la predeterminada. No se sobrescribe el plan ni el journal de importación. Una validación ya confirmada se rechaza antes de abrir Supabase; un checkpoint que avanzó remotamente se rechaza bajo el lock de la RPC. No ejecutar el antiguo SQL `900-validate-next.sql`: carece de checkpoint exacto y el ejecutor lo rechaza.

Después de cada paso: leer el ACK, ejecutar un postflight de READ ONLY, comprobar fase/cursor, snapshot, conteos, incidencias y ACL; sólo entonces preparar un checkpoint nuevo si no hay errores ni bloqueo. No hay reintentos automáticos ni un bucle de validación incorporado. La validación no publica ni cambia la versión predeterminada.

El operador puede agrupar invocaciones dentro de una sola fase del plan aprobado. Cada una sigue siendo un comando independiente de un único paso; el postflight recién observado sirve para contrastar el checkpoint siguiente. Fijar de antemano el máximo de lotes según el número de filas pendientes y el límite 250, y detener el grupo al cambiar de fase. Ante un fallo o resultado incierto, conservar la evidencia y el bloqueo; no repetir el comando. Al reanudar después de una interrupción, renovar el preflight remoto y contrastar el journal antes de ejecutar cualquier checkpoint guardado.

La respuesta visible incluye `fase`, `completa`, `errores` y los demás campos devueltos por la RPC. Debe pertenecer a la versión y snapshot seleccionados, respetar el cursor de su fase y demostrar avance. El checkpoint esperado se conserva en el marcador pendiente, en la confirmación y en cualquier fallo. Los errores activan la misma puerta de revisión; `completa: true` con errores no equivale a una versión válida. Una respuesta incierta no se repite: auditar y conciliar.

## 4. Publicar en DEV

```powershell
npm.cmd run cartografia:publish -- `
  --artifact ".artifacts\cartografia\<artifact_id>" `
  --project-ref "nppvprbfmjbhwheghipa"
```

La publicación es una acción separada y explícita. La versión anterior permanece íntegra y consultable; sólo cambia la versión predeterminada cuando la RPC de publicación concluye correctamente.

## 5. Actualización del 12 de noviembre

Usar una clave de versión nueva y conservar los ZIP anteriores. Ejecutar primero únicamente el preflight. Comparar:

- SHA-256 de MGS y BGD;
- conteos por capa;
- recibos de colonias, localidades y límites;
- distribución y grafo localidad-límite;
- diferencias esperadas del reseccionamiento.

Si cambia el contrato cerrado, crear y revisar una migración de compatibilidad y actualizar el contrato esperado del importador antes de cualquier `--apply`. Después, repetir el preflight con el mismo par de ZIP. La coexistencia de versiones permite mostrar la cartografía anterior y la reseccionada mediante `cartografia_version_id` sin mezclar geometrías ni datos electorales.

## 6. Producción

Este importador no acepta el project ref de producción. La promoción a producción debe hacerse mediante el procedimiento territorial controlado, con artefacto sellado, preflight y postflight de sólo lectura, confirmación explícita y rollback definido.

## Prueba de regresión con los ZIP reales

La prueba es optativa para no depender de archivos locales en CI:

```powershell
$env:SIPEEM_CARTOGRAFIA_REAL_TEST = "1"
$env:SIPEEM_CARTOGRAFIA_MGS_ZIP = "C:\ruta\mgs_15_Shapefile.zip"
$env:SIPEEM_CARTOGRAFIA_BGD_ZIP = "C:\ruta\bgd_15_Shapefile.zip"
node --test scripts/cartografia/real-packages.integration.test.mjs
```

Comprueba los hashes aprobados, los ocho conteos, los recibos territoriales y la continuidad y presupuesto de todos los lotes sin escribir en Supabase. El número de pasos depende del presupuesto de transporte; no cambia el número de filas fuente.
