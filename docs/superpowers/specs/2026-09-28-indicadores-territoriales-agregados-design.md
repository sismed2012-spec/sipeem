# Indicadores territoriales agregados — Diseño

**Fecha:** 2026-09-28
**Estado:** especificación escrita aprobada
**Alcance:** SIPEEM-DEV, API de lectura y mapa analítico

## 1. Propósito

Incorporar al mapa de SIPEEM indicadores electorales y demográficos agregados
por municipio, distrito local y distrito federal. Los resultados deben ser
reproducibles para una versión cartográfica concreta, conservar la procedencia
de cada dato y mostrar explícitamente la cobertura de las fuentes.

El usuario podrá alternar entre el mapa político actual y un mapa temático sin
perder los clics, popups, selección de municipio, capa de secciones, zoom ni
desplazamiento.

## 2. Contexto confirmado

La base disponible ya contiene:

- cartografía versionada con 7,052 secciones, 125 municipios, 45 distritos
  locales y 40 distritos federales en la versión examinada;
- cortes de padrón y lista nominal por sección, vinculados a una versión
  cartográfica mediante `lista_nominal_correspondencias`;
- datos demográficos ECEG por sección, vinculados mediante
  `demografia_eceg_correspondencias`;
- geometrías versionadas que relacionan cada sección con sus dimensiones de
  municipio, distrito local y distrito federal;
- un mapa SVG operativo y overlays ArcGIS para distritos y secciones.

La cobertura demográfica no es completa respecto de la cartografía actual. Por
ello, un valor ausente no puede convertirse en cero ni ocultarse al agregar.

## 3. Objetivos y criterios de éxito

La implementación será correcta cuando:

1. exista una sola fila agregada por territorio y nivel solicitado;
2. el resultado siempre identifique versión cartográfica, corte nominal y
   fuente demográfica;
3. los totales agregados coincidan con las secciones vinculadas de origen;
4. las tasas se calculen como cociente entre sumas, no como promedio de tasas;
5. los faltantes permanezcan distinguibles de los ceros observados;
6. la interfaz muestre la cobertura de cada fuente junto con el indicador;
7. desactivar el modo temático restaure exactamente el mapa político actual;
8. las claves de los polígonos de distrito se validen antes de aplicar color;
9. ninguna credencial privilegiada llegue al navegador;
10. las pruebas y verificaciones se ejecuten primero en SIPEEM-DEV.

## 4. Fuera de alcance

Este bloque no:

- modifica, corrige ni imputa los datos fuente;
- publica nuevas versiones cartográficas, cortes nominales o fuentes
  demográficas;
- reemplaza el mapa SVG por el visor ArcGIS definitivo;
- crea tablas materializadas o trabajos de refresco;
- incorpora escolaridad promedio como agregado territorial hasta confirmar un
  denominador estadístico compatible;
- despliega a producción sin una validación posterior explícita.

## 5. Enfoque elegido

Se implementará una RPC dinámica, versionada y de solo lectura. El volumen de
la cartografía actual permite agregar desde una relación normalizada por
sección sin introducir todavía tablas derivadas, refrescos ni invalidación.

Las alternativas descartadas son:

- **Agregados materializados:** añaden estado derivado y un proceso de
  publicación que no se justifica sin evidencia de un problema de rendimiento.
- **Agregación en el cliente:** descarga demasiado detalle, duplica reglas de
  negocio y expone la aplicación a resultados inconsistentes.

Si la medición posterior demuestra que la RPC no satisface el objetivo de
rendimiento, la misma interfaz podrá respaldarse con una vista materializada
sin cambiar el contrato HTTP ni los componentes del mapa.

## 6. Arquitectura

```text
fuentes publicadas
  lista_nominal_*              demografia_eceg_*
          |                            |
          +---- normalización por cartografia_seccion_id ----+
                                                               |
                                   cartografia_secciones       |
                                   (dimensiones territoriales) |
                                                               v
                           rpc_indicadores_territoriales(...)
                                                               |
                                GET /api/indicadores-territoriales
                                                               |
                         estado temático + panel + mapa SVG
```

La frontera principal es la sección cartográfica. Las dos fuentes se reducen
primero a una fila como máximo por `cartografia_seccion_id`. Solamente después
se combinan con `cartografia_secciones` y se agregan por dimensión territorial.
Esta secuencia evita productos cartesianos cuando ambas fuentes contienen una
fila para la misma sección.

## 7. Contrato SQL

Se añadirá una migración que cree:

```sql
public.rpc_indicadores_territoriales(
  p_nivel text,
  p_cartografia_version_id bigint,
  p_lista_nominal_corte_id bigint default null,
  p_demografia_fuente_id bigint default null
)
```

### 7.1 Parámetros

- `p_nivel` acepta exclusivamente `MUNICIPIO`, `DISTRITO_LOCAL` o
  `DISTRITO_FEDERAL`.
- `p_cartografia_version_id` es obligatorio. La función no mezcla versiones.
- Un corte nominal explícito debe estar en estado `PUBLICADO`, corresponder a
  la entidad de la versión y tener correspondencias para esa versión.
- Una fuente demográfica explícita debe estar en estado `PUBLICADA`, ser del
  conjunto `CPV2020_ECEG`, corresponder a la entidad y tener correspondencias
  para esa versión.
- Si el corte nominal es nulo, se selecciona el corte publicado compatible más
  reciente por `fecha_corte desc, lista_nominal_corte_id desc`.
- Si la fuente demográfica es nula, se selecciona la fuente ECEG publicada
  compatible más reciente por `anio_censal desc, published_at desc,
  demografia_fuente_id desc`.
- La ausencia de una fuente compatible produce un error controlado; no se
  sustituye por otra entidad, conjunto o versión.

### 7.2 Identidad devuelta

Cada fila devolverá columnas tipadas para:

- `nivel`;
- `territorio_id`, identificador estable de negocio;
- `cartografia_territorio_id`, identificador de la geometría versionada;
- `clave` y `nombre`;
- `cartografia_version_id`;
- `lista_nominal_corte_id`, `lista_nominal_fecha_corte`;
- `demografia_fuente_id`, `demografia_anio_censal`.

Para municipio, `territorio_id` será `municipio_id`; para cada tipo de distrito
será su identificador estable correspondiente. `cartografia_territorio_id`
permitirá unir el resultado con la geometría exacta de la versión.

### 7.3 Calidad y cobertura

Cada fila incluirá:

- `secciones_total`;
- `secciones_nominal`;
- `secciones_demografia`;
- `cobertura_fuente_nominal_pct`;
- `cobertura_fuente_demografia_pct`;
- `calidad_metricas jsonb`, con el número de secciones que aportaron valor a
  cada métrica demográfica nullable.

Los porcentajes usan `secciones_total` como denominador. Un territorio sin
correspondencias devuelve cero secciones cubiertas y métricas nulas.

### 7.4 Métricas electorales

Se devolverán como columnas numéricas:

- padrón de hombres, mujeres, no binario y total;
- lista nominal de hombres, mujeres, no binario y total;
- diferencia entre padrón y lista nominal;
- cobertura padrón-lista porcentual (`cobertura_padron_pct`), calculada como
  `sum(lista_total) * 100 / sum(padron_total)`.

La cobertura padrón-lista será cero únicamente cuando el padrón agregado sea
cero. Este indicador no es el mismo que la cobertura de secciones con fuente
nominal.

### 7.5 Métricas demográficas

El primer corte agregará las columnas ECEG aditivas disponibles:

- población total, femenina y masculina;
- población de 0–14, 15–64 y 65 o más años;
- población de 18 años o más;
- población económicamente activa y ocupada;
- población de 15 años o más analfabeta;
- población derechohabiente a servicios de salud;
- población con discapacidad;
- población hablante de lengua indígena;
- población afromexicana;
- viviendas habitadas;
- viviendas con agua, drenaje, electricidad, celular, computadora e internet.

`sum()` conservará `null` cuando ninguna sección aporte un valor. Cuando sólo
parte de las secciones aporte valor, se devolverá la suma observada y
`calidad_metricas` indicará su denominador exacto. No habrá extrapolación.

`graproes` no se agregará en este bloque porque promediarlo sin su ponderador
documentado produciría un indicador estadísticamente incorrecto.

## 8. Reglas de correspondencia

Para lista nominal sólo participan correspondencias con estado `VINCULADA`.
Para demografía sólo participan estados `VINCULO_HISTORICO` y `DIRECTA`.

Los joins territoriales se harán mediante `cartografia_seccion_id` y los
identificadores de dimensión presentes en `cartografia_secciones`. No se usarán
nombres, textos ni claves procedentes de los archivos fuente para decidir el
territorio agregado.

Las secciones cartográficas serán la tabla conductora, de modo que los
territorios sin datos sigan apareciendo en el resultado con su cobertura real.

## 9. API de aplicación

Se añadirá:

```text
GET /api/indicadores-territoriales
  ?nivel=MUNICIPIO|DISTRITO_LOCAL|DISTRITO_FEDERAL
  &versionId=<id obligatorio>
  &nominalCutId=<id opcional>
  &demographySourceId=<id opcional>
```

La ruta:

1. valida y normaliza los parámetros mediante una función independiente;
2. comprueba la sesión usando el patrón de autenticación existente;
3. invoca la RPC desde el servidor;
4. transforma nombres SQL a un contrato TypeScript estable;
5. responde con `data` y metadatos de procedencia;
6. devuelve errores tipados sin exponer mensajes internos ni secretos.

El cliente no enviará SQL, nombres de columnas ni tokens. Los parámetros se
limitarán a las enumeraciones e identificadores anteriores.

## 10. Contrato TypeScript

El dominio se aislará en un módulo enfocado en indicadores territoriales. Sus
tipos principales serán:

```ts
type TerritorialLevel =
  | "MUNICIPIO"
  | "DISTRITO_LOCAL"
  | "DISTRITO_FEDERAL";

type TerritorialMetricKey =
  | "padronTotal"
  | "listaNominalTotal"
  | "coberturaPadronPct"
  | "poblacionTotal"
  | "pea"
  | "poblacionOcupada"
  | "poblacionConDiscapacidad"
  | "viviendasHabitadas"
  | "viviendasConInternet";
```

La respuesta mantendrá disponibles todas las columnas agregadas, pero el
selector inicial del mapa expondrá sólo las métricas anteriores para evitar un
panel inmanejable. Ampliar el catálogo visual no requerirá cambiar la RPC.

## 11. Experiencia del mapa

El panel de capas incorporará una sección **Indicador territorial** con:

- modo `Mapa político` o `Indicador territorial`;
- selector de nivel;
- selector de métrica;
- fecha del corte nominal y año/fuente demográfica activos;
- leyenda de intervalos;
- explicación de cobertura y datos faltantes.

### 11.1 Comportamiento por nivel

- **Municipio:** el indicador colorea los polígonos municipales base.
- **Distrito local:** activa y colorea la geometría del distrito local; la base
  municipal queda neutral para evitar dos escalas simultáneas.
- **Distrito federal:** aplica la misma regla a su overlay.

La unión preferente usa `cartografia_territorio_id`. Si una geometría ArcGIS no
expone ese campo, un resolver explícito convertirá exclusivamente campos de
clave previamente verificados. No se permitirán coincidencias por nombre.

Un polígono sin correspondencia o cuyo indicador no tenga valor se mostrará en
gris como **Sin dato**. Las geometrías con cobertura parcial mostrarán el valor
observado y la cobertura en el popup. La leyenda advertirá que no hay
imputación. La capa no coloreará una geometría cuando la identidad territorial
sea ambigua.

### 11.2 Escala y leyenda

La primera versión usará cinco intervalos cuantiles calculados sobre los
valores no nulos del nivel activo. Si hay menos de cinco valores distintos, el
número de intervalos se reducirá. El color de **Sin dato** no participará en el
cálculo.

Los popups conservarán su contenido actual y añadirán un bloque temático con:

- nombre y valor del indicador;
- procedencia;
- cobertura de las fuentes nominal y demográfica;
- número de secciones cubiertas sobre el total.

Al volver a `Mapa político` se eliminan los colores y la leyenda temática, y se
restauran los colores de partido sin volver a cargar geometrías.

## 12. Estados y errores

La interfaz distinguirá:

- **Cargando:** conserva la geometría y muestra un indicador de progreso.
- **Sin fuente compatible:** mensaje explicativo; no reutiliza resultados de
  una selección anterior.
- **Sin datos en un territorio:** polígono gris y popup con cobertura cero.
- **Correspondencia ambigua:** polígono sin color temático y advertencia
  diagnóstica no sensible.
- **Fallo de red o RPC:** conserva el mapa político y ofrece reintento manual.
- **Cambio de versión durante una solicitud:** la respuesta antigua se ignora
  mediante cancelación o identidad de solicitud.

No habrá reintentos automáticos de escrituras porque este flujo es de lectura.

## 13. Seguridad

La función SQL será `stable`, `security invoker` y tendrá `search_path = ''`.
Todas las referencias estarán calificadas por esquema.

Se revocará su ejecución de `public`, `anon` y `authenticated`, y se concederá
solamente a `service_role`. La clave de servicio se utilizará exclusivamente en
la ruta servidor. La ruta conservará la autenticación de usuario de SIPEEM para
evitar convertir la RPC privilegiada en un endpoint público.

No se añadirá una vista pública ni acceso directo del navegador a las tablas de
fuente.

## 14. Rendimiento

La implementación reutilizará los índices existentes sobre correspondencias,
versión y destino cartográfico. Antes de añadir un índice se capturará el plan
de ejecución de los tres niveles con la versión completa.

El objetivo inicial es:

- una sola llamada RPC por cambio de nivel, versión o fuentes;
- respuesta de la RPC por debajo de 500 ms en SIPEEM-DEV con datos calientes;
- payload agregado, nunca las 7,052 filas de sección, para el mapa general.

Sólo si la medición incumple el objetivo se propondrá un índice adicional o una
materialización. Esa optimización requerirá evidencia del plan y conservará el
contrato público definido aquí.

## 15. Pruebas

### 15.1 SQL

- rechazar niveles inválidos y fuentes no publicadas/incompatibles;
- comprobar una fila por territorio y ausencia de duplicados;
- verificar 125 municipios, 45 distritos locales y 40 federales para la
  versión examinada, sin convertir esos conteos en constantes de la función;
- reconciliar totales nominales contra las filas vinculadas;
- reconciliar métricas demográficas contra las filas ECEG vinculadas;
- probar territorios con cobertura total, parcial y nula;
- probar que una métrica nula no se convierte en cero;
- verificar permisos y `search_path`.

### 15.2 Aplicación

- validación de parámetros y mapeo de respuesta de la API;
- catálogo de métricas y formateo de unidades;
- cuantiles con nulos, empates y menos de cinco valores distintos;
- resolución de claves de municipio y distritos con fixtures reales;
- descarte de respuestas obsoletas tras cambiar versión o nivel;
- restauración del modo político;
- convivencia con selección, popup, sección, zoom y arrastre.

### 15.3 Validación integrada

En SIPEEM-DEV se compararán muestras de municipio y ambos distritos contra SQL
de control independiente. Después se verificará el flujo completo en un
Preview de Vercel antes de considerar producción.

## 16. Secuencia de entrega

1. Añadir pruebas contractuales SQL que fallen con la función inexistente.
2. Crear la migración de la RPC y ejecutar las pruebas locales.
3. Añadir tipos, catálogo de métricas y pruebas unitarias.
4. Crear la ruta API y sus pruebas.
5. Incorporar el estado temático y el panel sin alterar el modo político.
6. Implementar la coloración municipal.
7. Validar claves y habilitar coloración de distritos local y federal.
8. Ejecutar pruebas de regresión, tipos y build.
9. Aplicar la migración únicamente en SIPEEM-DEV con preflight y postflight de
   lectura.
10. Validar el Preview desplegado. Producción queda fuera de este bloque.

## 17. Decisiones aplazadas

Las siguientes extensiones se evaluarán sólo con evidencia de necesidad:

- vistas materializadas y refrescos;
- clasificación por intervalos naturales Jenks;
- filtros por umbral de cobertura;
- descarga CSV de agregados;
- escolaridad promedio ponderada;
- reemplazo del mapa SVG por un visor ArcGIS completo.
