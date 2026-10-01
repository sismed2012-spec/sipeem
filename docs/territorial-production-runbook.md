# Promocion territorial y corte de aplicacion

Este runbook opera la base territorial separada de SIPEEM y su conexion con
Vercel. No sustituye la base principal usada por Auth, sesiones y operacion.

## Proyectos autorizados

- Origen territorial: `SIPEEM-DEV` (`nppvprbfmjbhwheghipa`).
- Destino territorial: `SIPEEM-TERRITORIAL-PROD`
  (`cdvukcthosppezjscwod`).
- Aplicacion: proyecto Vercel `sipeem`.

Los proyectos operativos declarados como denegados por la politica del
promotor no pueden usarse como origen ni destino.

## Variables del corte

La aplicacion cambia de fuente territorial mediante dos variables de servidor:

```env
CARTOGRAFIA_SUPABASE_URL=https://cdvukcthosppezjscwod.supabase.co
CARTOGRAFIA_SUPABASE_SERVICE_ROLE_KEY=<credencial-servidor>
```

La segunda variable conserva un nombre historico. Puede contener una clave
secreta de servidor `sb_secret_...` de Supabase y nunca debe exponerse al
navegador, registrarse en Git, mostrarse en logs ni pasarse como argumento de
linea de comandos.

No se modifican `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY` ni `SUPABASE_SERVICE_ROLE_KEY`: esas variables
siguen perteneciendo al Supabase principal de autenticacion y operacion.

## Preflight y promocion

1. Confirmar un arbol Git limpio y el commit integrado que se va a desplegar.
2. Validar el manifiesto inmutable y su hash.
3. Ejecutar el preflight de solo lectura.
4. Aplicar esquema o datos una sola vez, unicamente con la confirmacion exacta
   emitida por el promotor.
5. Ejecutar el postflight integral y no iniciar el corte hasta alcanzar
   `VERIFIED`.

Comando de estado para el ciclo de recuperacion vigente:

```powershell
npm.cmd run territorial:promote -- status --manifest infra/territorial/manifests/production/2026-10-01-sipeem-territorial-prod-recovery-01.json
```

El estado esperado antes del Preview es `VERIFIED` y la siguiente accion debe
ser `preview-cutover`.

## Estados y reanudacion

```text
CREATED
  -> PREFLIGHT_PASSED
  -> SCHEMA_APPLYING -> SCHEMA_APPLIED
  -> DATA_APPLYING   -> DATA_APPLIED
  -> VERIFYING       -> VERIFIED
  -> PREVIEW_CUTOVER -> PREVIEW_VERIFIED
  -> PROD_CUTOVER    -> COMPLETE
```

- Las fases de lectura pueden repetirse.
- Las fases de escritura no se reintentan automaticamente.
- `BLOCKED` conserva el journal y permite reanudar tras corregir la causa.
- `FAILED_CONFIRMED` exige diagnostico antes de una nueva ejecucion.
- `FAILED_UNKNOWN` impide repetir la escritura: primero se inspeccionan journal,
  inventario y evidencia para determinar si el efecto remoto ocurrio.

Si se agotan creditos o se pierde conectividad, no se elimina el journal ni se
reinicia la fase. Al volver el servicio se ejecutan sondas de lectura y se
continua desde el ultimo estado confirmado.

### Recuperacion de un candado de esquema huerfano

El archivo `infra/territorial/journals/<manifest-sha256>.json.schema-apply.lock`
falla cerrado si el proceso termina abruptamente. Nunca se elimina mientras
exista un proceso `territorial:promote ... schema-apply` activo.

1. Confirmar que no existe ningun proceso de promocion de esquema activo.
2. Leer el journal exacto del mismo manifiesto.
3. Si el estado es `SCHEMA_APPLYING`, conservar el candado y ejecutar solamente
   las sondas de lectura; no repetir `db push`.
4. Solo si el journal sigue en `PREFLIGHT_PASSED`, no existe proceso activo y no
   se inicio la escritura remota, eliminar exclusivamente ese archivo `.lock`.
5. Registrar la comprobacion y volver a ejecutar el plan antes de una nueva
   ejecucion explicitamente confirmada. No hay reintento automatico.

## Corte aislado en Preview

1. Crear una rama temporal desde el commit verificado.
2. Guardar fuera de Git la existencia y alcance de cualquier override previo.
3. Añadir las dos variables como `preview` limitadas exclusivamente a esa rama.
   Sus valores entran por `stdin` desde los proveedores; nunca mediante
   `--env NOMBRE=VALOR`, texto en el comando o archivos versionados.
4. Crear un despliegue Preview sin `--prod`.
5. Confirmar estado `READY` y que Produccion conserva su despliegue y variables.
6. Ejecutar la aceptacion autenticada:
   - login y sesion;
   - mapa politico y 125 municipios;
   - seleccion de seccion y geometria;
   - demografia;
   - lista nominal;
   - indicadores territoriales;
   - distritos, zoom y arrastre;
   - estados `Sin dato`;
   - rechazo de peticiones no autenticadas a las API protegidas.
7. Comparar muestras de las respuestas con el postflight SQL certificado.
8. Registrar `PREVIEW_VERIFIED` solo si toda la historia pasa.

El despliegue Preview no autoriza un despliegue `--prod` ni cambios en variables
de Production.

Si el proyecto Vercel no tiene un repositorio Git conectado, Vercel no permite
overrides branch-specific. En ese caso no se reemplazan las variables globales:
se crea un unico Preview con overrides por despliegue usando `--env NOMBRE`
sin `=VALOR`, y los valores se inyectan solamente en el entorno del proceso
hijo. La CLI lee las dos claves del entorno sin mostrarlas en argumentos. No se
permite `--env NOMBRE=VALOR`.

## Rollback del Preview

Si falla la aceptacion:

1. eliminar o restaurar solamente los overrides branch-specific de
   `CARTOGRAFIA_SUPABASE_URL` y
   `CARTOGRAFIA_SUPABASE_SERVICE_ROLE_KEY`;
2. no modificar las variables globales de Preview ni las de Production;
3. redeplegar la misma rama si se necesita comprobar la restauracion;
4. confirmar que el Supabase principal de SIPEEM y el despliegue productivo no
   cambiaron;
5. conservar la evidencia del error sin incluir secretos.

Eliminar el override de una rama hace que vuelva a heredar el valor general de
Preview. Si no existia un valor general, la aplicacion volvera a fallar de forma
cerrada en las rutas territoriales sin afectar Auth.

Cuando el Preview se creo con el fallback de overrides por despliegue no existe
un override de rama que restaurar: el despliegue es inmutable. Se deja de usar
esa URL y se crea un Preview sustituto desde el mismo commit, inyectando por el
entorno hijo los valores que se desean comprobar. Antes de retirar la URL
anterior se verifica que el sustituto esta `READY`, que sus rutas territoriales
responden y que las variables globales y el despliegue de Production conservan
su huella previa. No se promueve ni se reutiliza como Production el despliegue
fallido.

## Rotacion de credenciales

1. Crear una nueva clave secreta de servidor en Supabase.
2. Añadirla al mismo alcance branch-specific sin mostrar el valor.
3. crear un nuevo Preview y repetir la aceptacion.
4. Eliminar la clave anterior solamente despues de verificar el nuevo
   despliegue.
5. Registrar fecha, responsable y hash SHA-256 de la clave; nunca su valor.

Para un Preview con overrides por despliegue, la rotacion siempre crea un
despliegue nuevo con la clave nueva en el entorno hijo. Se repite la aceptacion
completa y solo entonces se revoca la clave anterior y se retira de uso la URL
del Preview anterior; no se intenta editar sus variables inmutables.

La rotacion de Production es una operacion separada y requiere su propio corte
controlado.
