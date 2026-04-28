# Módulos de Actores Políticos — Especificación de Diseño

**Fecha:** 2026-04-21  
**Estado:** Aprobado  
**Módulo:** SIPEEM — Actores Políticos  
**Ruta base:** `/admin/estrategia-municipal/[id]`

---

## 1. Objetivo

Extender la ficha estratégica por municipio con cinco sub-módulos de captura de actores políticos: Termómetros, Escenarios, Comité Municipal, Planilla y Aspirantes. Todos los módulos viven dentro de la página existente de estrategia municipal como tabs adicionales.

---

## 2. Acceso y Roles

- Visible y editable **solo para `director` y `admin`**.
- Operadores no tienen acceso a `/admin/...` — sin cambios al sistema de roles.
- Todas las server actions pasan por `assertAdmin()` antes de ejecutar cualquier operación.

---

## 3. Navegación

La página `/admin/estrategia-municipal/[id]` se convierte en una página con tabs de 6 pestañas:

| # | Tab | Descripción |
|---|-----|-------------|
| 1 | Estrategia | Contenido actual: resumen electoral + formulario estratégico |
| 2 | Termómetros | 5 dimensiones de medición política (T1–T5), valores numéricos |
| 3 | Escenarios | 4 escenarios con 2 campos de texto cada uno |
| 4 | Comité | Datos del comité municipal (presidente, secretario, ubicación) |
| 5 | Planilla | Lista de integrantes de la planilla de candidatos |
| 6 | Aspirantes | Registro de aspirantes políticos con datos de contacto |

El header con breadcrumb, nombre del municipio y badges de prioridad/riesgo permanece **fuera de los tabs**, siempre visible.

---

## 4. Modelo de Datos

Los tipos ya están definidos en `src/lib/types.ts`. Se asume que las tablas correspondientes existen en Supabase.

### Tablas de 1 fila por municipio (upsert)

**`termometros`**
```ts
{ id, municipio_id, term1, term2, term3, term4, term5 }
// term1-term5: numéricos, representan 5 dimensiones políticas (T1-T5)
```

**`escenarios`**
```ts
{ id, municipio_id, e1_comp, e1_rec, e2_gen, e2_atr, e3_gob, e3_dem, e4_niv, e4_foco }
// 4 escenarios × 2 campos de texto (etiquetas genéricas por ahora)
```

**`comite_municipal`**
```ts
{ id, municipio_id, presidente, secretario, fachada_url, link_maps, inaugurado }
```

### Tablas de N filas por municipio (CRUD)

**`planilla`**
```ts
{ id, municipio_id, cargo, nombre, partido, foto_url }
// foto_url es nullable — no se captura en el formulario inicial
```

**`aspirantes`**
```ts
{ id, municipio_id, nombre, cargo_aspirado, partido, fecha_nacimiento, telefono, email, foto_url, notas }
// foto_url es nullable — no se captura en el formulario inicial
```

---

## 5. Capa de Datos — `src/actions/actores.ts`

Archivo `"use server"` con una función de lectura y 9 funciones de escritura.

### Lectura

```ts
getActoresMunicipio(municipioId: number): Promise<{
  termometros: Termometros | null;
  escenarios: Escenarios | null;
  comite: ComiteMunicipal | null;
  planilla: Planilla[];
  aspirantes: Aspirante[];
}>
```
Ejecuta 5 queries en paralelo con `Promise.all`.

### Escritura — upsert (1 fila)

```ts
upsertTermometros(municipioId: number, data: Omit<Termometros, 'id' | 'municipio_id'>)
upsertEscenarios(municipioId: number, data: Omit<Escenarios, 'id' | 'municipio_id'>)
upsertComite(municipioId: number, data: Omit<ComiteMunicipal, 'id' | 'municipio_id'>)
```
Conflicto en `municipio_id`. Cada acción llama `revalidatePath` al final.

### Escritura — CRUD (N filas)

```ts
createPlanillaMember(municipioId: number, data: Omit<Planilla, 'id' | 'municipio_id' | 'foto_url'>)
deletePlanillaMember(id: number)

createAspirante(municipioId: number, data: Omit<Aspirante, 'id' | 'municipio_id' | 'foto_url'>)
updateAspirante(id: number, data: Partial<Omit<Aspirante, 'id' | 'municipio_id' | 'foto_url'>>)
deleteAspirante(id: number)
```

Cada acción hace `revalidatePath("/admin/estrategia-municipal/[municipioId]")`.

---

## 6. Componentes

### `src/components/actores/ActoresTabs.tsx` — Client Component

Wrapper principal. Recibe todos los datos como props, renderiza `<Tabs>` con 6 pestañas. El tab activo se mantiene con `useState`. El contenido del tab Estrategia (resumen electoral + `StrategicForm`) se recibe como `children`.

Props:
```ts
{
  municipioId: number;
  actores: ActoresMunicipioData;
  children: React.ReactNode; // tab Estrategia (contenido existente)
}
```

### Formularios upsert — patrón `StrategicForm`

Cada uno sigue el mismo patrón: `useState` para loading/error, `handleSubmit` con `e.preventDefault()`, toast de éxito, `router.refresh()` al guardar.

- **`TermometrosForm.tsx`** — 5 inputs numéricos (T1–T5), rango 0–100
- **`EscenariosForm.tsx`** — 8 textareas organizados en 4 grupos de 2 (Escenario 1 A/B … Escenario 4 A/B)
- **`ComiteForm.tsx`** — campos: presidente (text), secretario (text), fachada_url (url, optional), link_maps (url, optional), inaugurado (checkbox)

### Paneles CRUD

**`PlanillaPanel.tsx`**
- Tabla con columnas: Cargo | Nombre | Partido | Acciones
- Botón "Eliminar" por fila
- Formulario de alta colapsable al final de la sección (campos: cargo, nombre, partido)
- Sin edición inline — eliminar y re-crear si se requiere cambio

**`AspirantesPanel.tsx`**
- Tabla con columnas: Nombre | Cargo aspirado | Partido | Contacto | Acciones
- Botón "Editar" por fila: reemplaza la fila por formulario inline con todos los campos
- Botón "Eliminar" por fila (siempre visible)
- Formulario "Agregar aspirante" colapsable al final de la sección
- Campos: nombre, cargo_aspirado, partido, fecha_nacimiento (date, optional), telefono (optional), email (optional), notas (textarea, optional)

---

## 7. Modificación de la Página Existente

`/admin/estrategia-municipal/[id]/page.tsx` — cambios:

1. Agregar fetch paralelo de actores:
```ts
const [{ estrategia, electoral }, actores] = await Promise.all([
  getMunicipioStrategicFile(municipioId),
  getActoresMunicipio(municipioId),
]);
```

2. El JSX del resumen electoral y `<StrategicForm>` se envuelve en el `children` del primer tab.

3. El header (breadcrumb, nombre del municipio, badges) permanece fuera de `<ActoresTabs>`.

4. El footer de última actualización se mueve dentro del tab Estrategia.

Estructura final del return:
```tsx
<>
  {/* Header — siempre visible */}
  <div>...</div>

  {/* Tabs — todo el contenido */}
  <ActoresTabs municipioId={municipioId} actores={actores}>
    {/* Tab Estrategia — children */}
    <ResumenElectoral ... />
    <StrategicForm ... />
    <Footer ... />
  </ActoresTabs>
</>
```

---

## 8. Archivos a Crear / Modificar

| Archivo | Acción |
|---------|--------|
| `src/actions/actores.ts` | Crear |
| `src/components/actores/ActoresTabs.tsx` | Crear |
| `src/components/actores/TermometrosForm.tsx` | Crear |
| `src/components/actores/EscenariosForm.tsx` | Crear |
| `src/components/actores/ComiteForm.tsx` | Crear |
| `src/components/actores/PlanillaPanel.tsx` | Crear |
| `src/components/actores/AspirantesPanel.tsx` | Crear |
| `src/app/(protected)/admin/estrategia-municipal/[id]/page.tsx` | Modificar |

---

## 9. Fuera de Alcance

- Carga de fotos (`foto_url`) para planilla y aspirantes — campo nullable, se puede extender después
- Edición inline para planilla — eliminar y re-crear es suficiente para la v1
- Paginación en aspirantes/planilla — se asume volumen bajo por municipio
- Nuevas tablas en Supabase — se asume que las tablas ya existen
