# Rediseño de Perfil Municipal de Inteligencia

## Objetivo

Mejorar la página de perfil municipal en `/admin/historial/municipio/[id]` para que la lectura inicial sea más útil, priorizando el contexto histórico visible al primer scroll y corrigiendo la ausencia de `2023` en la narrativa visual superior.

## Problema Actual

- El bloque de KPIs y gráficas ocupa la zona alta, pero el `Registro Cronológico Detallado` queda demasiado abajo.
- La cronología contiene la información más útil para entender alternancia, fuerza ganadora y márgenes, pero hoy aparece separada de la lectura principal.
- El año `2023` existe en el modelo para seccionales de gubernatura, pero no queda incorporado con suficiente claridad en la parte alta de la experiencia ni en todas las gráficas relevantes.

## Diseño Aprobado

Se implementará una composición tipo `hero + banda cronológica compacta`.

### Estructura visual

1. Mantener encabezado y badges de consistencia.
2. Conservar KPIs, pero con mejor integración visual con el bloque histórico.
3. Subir el `Registro Cronológico Detallado` a la primera sección útil del contenido, inmediatamente después de los KPIs.
4. Transformar ese registro en una banda compacta de tarjetas por año, con prioridad visual al ganador, porcentaje, margen y top de fuerzas.
5. Reubicar las gráficas debajo de esta banda, ya con el usuario contextualizado por la cronología.
6. Mantener el panel de `Análisis Estratégico` como complemento lateral, sin competir por prioridad con la cronología.

### Inclusión de 2023

- `2023` debe aparecer explícitamente en la cronología superior cuando exista información disponible para el municipio.
- `2023` debe incorporarse en las gráficas del perfil municipal cuando el dataset combinable lo permita.
- Cuando `2023` corresponda a la capa de gubernatura y no al flujo municipal ordinario, debe distinguirse visualmente para evitar una lectura engañosa.
- La vista seccional de gubernatura para `2023` se mantiene como panel especializado, pero la narrativa superior ya no debe “ocultar” ese año.

## Cambios de Componente

### Página objetivo

Archivo principal:

- `src/app/(protected)/admin/historial/municipio/[id]/page.tsx`

### Ajustes esperados

- Reordenar el layout superior.
- Extraer o recomponer la cronología en un bloque más compacto y visualmente más fuerte.
- Ajustar títulos, subtítulos y spacing para que la lectura inicial quede en este orden:
  1. contexto del municipio
  2. KPIs
  3. cronología
  4. gráficas
  5. análisis estratégico
  6. detalle seccional

### Datos

La acción `getMunicipioHistorialAnalytics` ya devuelve `timeline`.

Se revisará:

- si `timeline` ya contiene `2023` para el municipio
- si las gráficas `MunicipioMultiPartyChart` y `MunicipioMarginChart` reciben ese año sin filtrados implícitos
- si hace falta enriquecer el DTO para marcar tipo de elección o fuente del evento `2023`

## Flujo de Datos

1. La página obtiene `data` desde `getMunicipioHistorialAnalytics`.
2. La cronología compacta superior consume `data.timeline`.
3. Las gráficas consumen la misma serie temporal, ya incluyendo `2023` cuando exista.
4. El panel seccional continúa usando:
   - `MunicipioSectionsPanel` para años municipales
   - `GubernaturaSeccionalPanel` para `2023`

## Manejo de Casos

- Si no existe `2023` para un municipio, la UI no debe inventarlo ni reservar espacio vacío.
- Si `2023` existe solo como evento de gubernatura, debe mostrarse con etiqueta contextual.
- Si hay más de tres eventos, la banda cronológica debe seguir siendo legible en desktop y mobile.
- Si el contenido es demasiado ancho en móvil, se priorizará stack vertical o scroll horizontal controlado.

## Verificación

- La ruta `/admin/historial/municipio/[id]` debe seguir compilando sin errores.
- El año `2023` debe verse en la parte superior del perfil para municipios con datos disponibles.
- Las gráficas deben reflejar `2023` cuando corresponda.
- El bloque cronológico debe quedar por encima de las gráficas.
- La vista seccional especializada de `2023` no debe romperse.

## Riesgos

- Mezclar municipal y gubernatura sin etiquetado puede inducir interpretación incorrecta.
- Si `timeline` no trae metadatos suficientes para distinguir el tipo de elección, será necesario enriquecer el DTO.
- El rediseño puede tensar el alto del “above the fold” si no se compactan bien las tarjetas.
