# Integracion ArcGIS para SIPEEM

Esta guia sirve para montar el mapa territorial de SIPEEM con `ArcGIS Online` o `ArcGIS Enterprise`, manteniendo `Next.js + Supabase` como capa de negocio.

## Objetivo

- Usar ArcGIS como motor geoespacial para:
  - 125 municipios
  - 7052 secciones electorales
  - puntos de publicidad exterior
  - rutas de transporte publico
  - capas tematicas adicionales
- Usar la app para:
  - autenticacion
  - permisos
  - analitica electoral y demografica
  - integracion con Supabase

## Arquitectura recomendada

- `ArcGIS`
  - geometria
  - capas cartograficas
  - simbologia por escala
  - popups base
  - edicion geoespacial si la necesitas
- `Supabase`
  - datos electorales
  - datos demograficos enriquecidos
  - catalogos internos
  - usuarios y permisos
- `Next.js`
  - proxy seguro a ArcGIS desde `route handlers`
  - mezcla de datos ArcGIS + Supabase
  - UI y experiencia del operador

## Fase 1: Preparar datos en ArcGIS

### 1. Crear las capas maestras

Publica estas capas como `Hosted Feature Layer`:

1. `municipios_edomex`
2. `secciones_electorales_edomex`
3. `publicidad_exterior`
4. `rutas_transporte`

### 2. Definir llaves de integracion

Cada capa debe tener un identificador estable para cruces con SIPEEM.

Campos minimos recomendados:

| Capa | Campos clave |
| --- | --- |
| Municipios | `geo_municipio_id`, `nombre`, `region`, `distrito` |
| Secciones | `seccion_id`, `geo_municipio_id`, `seccion`, `tipo` |
| Publicidad | `publicidad_id`, `geo_municipio_id`, `tipo`, `estatus` |
| Rutas | `ruta_id`, `geo_municipio_id`, `nombre`, `estatus` |

Regla importante:

- `geo_municipio_id` debe coincidir con `municipios.geo_municipio_id` en Supabase.
- `seccion_id` debe ser unico y estable.
- No dependas del `OBJECTID` como llave de negocio.

### 3. Normalizar esquema

Conviene agregar estos campos operativos en casi todas las capas:

- `estatus`
- `fuente`
- `observaciones`
- `created_at`
- `updated_at`
- `created_by`

## Fase 2: Crear vistas seguras

No conectes la app directamente a la capa maestra.

Crea `Hosted Feature Layer Views` para separar usos:

1. `municipios_view_app`
2. `secciones_view_app`
3. `publicidad_view_app`
4. `rutas_view_app`

Usa las `views` para:

- ocultar campos sensibles
- filtrar subconjuntos
- controlar permisos de lectura y edicion
- compartir de forma distinta sin duplicar datos

## Fase 3: Definir visibilidad por escala

Configura visibilidad para que el mapa no se vuelva ilegible ni pesado.

Sugerencia inicial:

- `municipios`
  - visibles desde zoom lejano
  - siempre activos como capa base
- `secciones`
  - visibles en zoom medio y alto
- `rutas`
  - visibles en zoom medio
- `publicidad`
  - visible solo en zoom alto

Objetivo:

- a escala estatal ves municipios
- al acercarte ves secciones
- al acercarte mas ves puntos y rutas

## Fase 4: Configurar permisos

Define si tu informacion sera publica o privada.

### Opcion A: datos publicos o de bajo riesgo

- Usa `ARCGIS_AUTH_MODE=none` o `token` sencillo
- Adecuado para capas no sensibles

### Opcion B: datos internos o sensibles

- Usa capas privadas
- Consume ArcGIS solo desde el servidor Next
- No expongas tokens en el navegador

Para SIPEEM, esta es la opcion recomendada.

## Fase 5: Conectar con esta app

La app ya queda preparada con estos endpoints:

- `GET /api/arcgis/catalog`
- `GET /api/arcgis/municipios`
- `GET /api/arcgis/secciones`
- `GET /api/arcgis/publicidad`
- `GET /api/arcgis/rutas`

Ejemplos:

```txt
/api/arcgis/municipios?where=1%3D1&outFields=geo_municipio_id,nombre&returnGeometry=true
```

```txt
/api/arcgis/secciones?where=geo_municipio_id=15&outFields=seccion_id,seccion,tipo&returnGeometry=true
```

## Variables de entorno

Define estas variables en `.env.local`:

```env
ARCGIS_PORTAL_URL=https://www.arcgis.com
ARCGIS_AUTH_MODE=token
ARCGIS_TOKEN=your-arcgis-token

ARCGIS_LAYER_MUNICIPIOS_URL=https://.../FeatureServer/0
ARCGIS_LAYER_SECCIONES_URL=https://.../FeatureServer/0
ARCGIS_LAYER_PUBLICIDAD_URL=https://.../FeatureServer/0
ARCGIS_LAYER_RUTAS_URL=https://.../FeatureServer/0

NEXT_PUBLIC_ENABLE_ARCGIS_MAP=false
```

## Checklist operativo en ArcGIS

### Datos

- [ ] Publicar municipios como hosted feature layer
- [ ] Publicar secciones como hosted feature layer
- [ ] Publicar publicidad exterior como hosted feature layer
- [ ] Publicar rutas como hosted feature layer
- [ ] Verificar que cada capa tenga llaves estables

### Seguridad

- [ ] Crear views de solo lectura para la app
- [ ] Ocultar campos sensibles en las views
- [ ] No compartir la capa maestra con toda la organizacion si no es necesario
- [ ] Definir si el acceso sera publico, por token o privado

### Cartografia

- [ ] Configurar simbologia base por tipo de capa
- [ ] Ajustar popups
- [ ] Configurar visibilidad por escala
- [ ] Validar rendimiento al activar varias capas

### Integracion con SIPEEM

- [ ] Homologar `geo_municipio_id`
- [ ] Homologar `seccion_id`
- [ ] Registrar URLs finales de las views en `.env.local`
- [ ] Probar `/api/arcgis/catalog`
- [ ] Probar consultas por capa desde la app

## Orden recomendado de implementacion

1. Publica `municipios`
2. Publica `secciones`
3. Crea sus `views`
4. Configura las URLs en `.env.local`
5. Prueba los endpoints del proyecto
6. Luego agrega `publicidad` y `rutas`
7. Al final, monta el visor ArcGIS en la pagina `/mapa`

## Siguiente paso tecnico sugerido

Cuando tengas las URLs reales de tus capas o views, el siguiente cambio en el repo deberia ser:

1. crear un componente cliente `ArcGISMap`
2. alternar entre el mapa SVG actual y el mapa ArcGIS con una feature flag
3. unir popups ArcGIS con datos de Supabase por `geo_municipio_id` y `seccion_id`
