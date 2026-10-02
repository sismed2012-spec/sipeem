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

## 3. Validar

```powershell
npm.cmd run cartografia:validate -- `
  --artifact ".artifacts\cartografia\<artifact_id>" `
  --project-ref "nppvprbfmjbhwheghipa"
```

Cada invocación ejecuta un único paso de validación. Repetirlo manualmente sólo después de leer el resultado, hasta que la carga alcance su estado terminal válido. La validación no publica ni cambia la versión predeterminada.

La respuesta visible incluye `fase`, `completa`, `errores` y los demás campos devueltos por la RPC. Los errores activan la misma puerta de revisión; `completa: true` con errores no equivale a una versión válida.

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

Comprueba los hashes aprobados, los ocho conteos, los recibos territoriales y los 88 pasos reanudables sin escribir en Supabase.
