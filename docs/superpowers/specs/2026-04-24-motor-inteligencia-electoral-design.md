# Motor de Inteligencia Electoral — SIPEEM Design Spec (v2)
Date: 2026-04-24

## Objetivo

Evolucionar el Asistente IA existente (`AsistenteChat` + `/api/ai/municipio-context/route.ts`) en una experiencia más completa con panel de contexto visual, análisis global cross-municipio y capacidad de guardar síntesis ejecutivas. No se crea una segunda experiencia de chat — se mejora la existente.

---

## Estado actual del sistema

Ya existe y funciona:

| Elemento | Archivo | Estado |
|----------|---------|--------|
| Chat con streaming | `src/components/actores/AsistenteChat.tsx` | ✅ Funciona |
| Route handler streaming | `src/app/api/ai/municipio-context/route.ts` | ✅ Funciona |
| Route handler genérico | `src/app/api/ai/chat/route.ts` | ✅ Funciona |
| Tab "Asistente IA" | `src/components/actores/ActoresTabs.tsx:48` | ✅ Existe |

Contexto que YA carga `municipio-context/route.ts`: estrategia, historial electoral (con %, siglas, margen), termómetros, comité, aspirantes, planilla.

Contexto que FALTA en la ruta actual: cobertura de secciones (%), proyección numérica/nivel, competencia/riesgo electoral.

---

## Decisiones de diseño (definitivas)

| Decisión | Elección | Razón |
|----------|----------|-------|
| Patrón base | Evolucionar AsistenteChat, no duplicar | Ya existe, funciona, streaming |
| Respuestas | Streaming (Route Handler) | Consistente con lo existente; retroceder a blocking sería downgrade |
| Tab municipal | Conservar "Asistente IA" en ActoresTabs; reemplazar contenido | Sin cambio de UX visible para el usuario |
| Nueva vista | `/admin/inteligencia` para análisis global/comparativo | Modo nuevo, no conflicto con modal municipal |
| Panel de contexto | `ContextPanel` nuevo, montado junto al chat | En ambos modos |
| tendenciaML | Excluida de esta fase | Datos no conectados aún al contexto del chat |
| Proyección | Usar `getProyeccionMunicipios()` filtrando por municipio | Consistencia con el resto del sistema |
| Guardar | Síntesis ejecutiva (no transcript crudo) en tabla `briefings` | Mantiene calidad del repositorio ejecutivo |
| generadoPor | Server lo toma de `getUsuarioActual()` siempre | Igual que en `briefings.ts` |
| Historial | Últimos 8 mensajes + mensaje actual enviados al LLM | Control de costo/latencia |
| Modo global | Selector de municipios + top-urgencia como sugerencia | Explícitamente comparativo, no "todo" |

---

## Arquitectura

### Modo municipal (evolución del existente)

```
ActoresTabs → tab "Asistente IA"
  InteligenciaChatShell (reemplaza AsistenteChat)
    ├── ContextPanel (izquierda, ~30%)
    │     Tabs: KPIs · Actores · Historial
    │     Botón "Guardar síntesis"
    └── ChatArea (derecha, ~70%)
          useState<Message[]>  ← historial completo en cliente
          Envía: últimos 8 mensajes al API
          POST /api/ai/municipio-context  ← ruta existente, enriquecida
```

### Modo global (nuevo)

```
/admin/inteligencia (nueva página)
  InteligenciaChatShell (mismo componente, mode="global")
    ├── ContextPanel
    │     Selector múltiple de municipios (hasta 5)
    │     Muestra top-5 por urgency como sugerencia inicial
    │     Botón "Guardar síntesis"
    └── ChatArea
          POST /api/ai/inteligencia  ← nueva ruta con contexto cross-municipio
```

---

## Tipos compartidos

```ts
// src/lib/inteligencia-types.ts  ← NUEVO archivo de tipos
export type Message = { role: "user" | "assistant"; content: string };

export type MunicipioKPIs = {
  nombre: string;
  proyeccion: { puntuacion: number; nivel: string } | null;
  termometros: { term1: number; term2: number; term3: number; term4: number; term5: number } | null;
  coberturaPromedio: number | null;   // % promedio de compromisos/meta con meta > 0
  riesgoElectoral: string | null;
  estrategia: { prioridad: string; riesgo: string; estatus: string } | null;
};

export type ActoresData = {
  comite: { presidente: string; secretario: string } | null;
  planilla: { cargo: string; nombre: string; partido: string }[];
  aspirantes: { nombre: string; cargo_aspirado: string; partido: string }[];
};

export type HistorialItem = {
  anio: number;
  winnerSiglas: string;
  porcentaje: number | null;
};
```

---

## Archivos afectados

### Nuevos

| Archivo | Responsabilidad |
|---------|----------------|
| `src/lib/inteligencia-types.ts` | Tipos compartidos entre componentes y rutas |
| `src/components/inteligencia/InteligenciaChatShell.tsx` | Shell principal: monta ContextPanel + ChatArea, gestiona messages[], modo municipal/global |
| `src/components/inteligencia/ContextPanel.tsx` | Panel izquierdo: tabs KPIs/Actores/Historial, selector municipios (modo global), botón Guardar |
| `src/components/inteligencia/ChatArea.tsx` | Lista de mensajes, input textarea, spinner, scroll automático |
| `src/app/(protected)/admin/inteligencia/page.tsx` | Page Server Component: carga lista municipios activos, renderiza InteligenciaChatShell mode=global |
| `src/app/api/ai/inteligencia/route.ts` | Route Handler streaming: contexto cross-municipio para modo global |
| `src/actions/inteligencia.ts` | `guardarSintesisIA(municipioId, messages)` — sintetiza conversación y guarda en briefings |

### Modificados

| Archivo | Cambio |
|---------|--------|
| `src/app/api/ai/municipio-context/route.ts` | Agregar cobertura %, proyección real y riesgo electoral al contexto |
| `src/components/actores/ActoresTabs.tsx` | Cambiar `<AsistenteChat>` por `<InteligenciaChatShell mode="municipal" municipioId={municipioId}>` |
| `src/components/layout/SidebarNav.tsx` | Nueva entrada "Inteligencia IA" con ícono `Brain` |

### Eliminados

| Archivo | Razón |
|---------|-------|
| `src/components/actores/AsistenteChat.tsx` | Reemplazado por `InteligenciaChatShell` |

---

## Detalle por archivo

### `src/lib/inteligencia-types.ts`

Ver sección Tipos compartidos arriba. Solo tipos — sin lógica.

---

### `src/app/api/ai/municipio-context/route.ts` (modificación)

**No llamar a `getProyeccionMunicipios()`** desde el Route Handler — esa función tiene `redirect()` interno y carga los 125 municipios. En su lugar, calcular la proyección para el municipio específico con una query directa usando el `svc` ya autenticado del Route Handler.

Agrega estas fuentes al contexto existente en la query paralela:

```ts
// En la llamada paralela, añadir:
svc.from("compromisos_seccion").select("compromisos,meta").eq("municipio_id", municipioId),
svc.from("competencia_municipal").select("riesgo_electoral").eq("municipio_id", municipioId).maybeSingle(),
svc.from("historial_electoral").select("partido_ganador_id").eq("municipio_id", municipioId)
   .order("anio", { ascending: false }).limit(2),
svc.from("configuracion").select("clave,valor").in("clave", [
  "proyeccion_peso_historial","proyeccion_peso_termometros",
  "proyeccion_peso_cobertura","proyeccion_peso_competencia",
]),
```

Calcula proyección inline (misma lógica que `proyeccion.ts`):
```ts
const cobRows = cobRes.data ?? [];
const withMeta = cobRows.filter((r: { meta: number }) => r.meta > 0);
const coberturaPromedio = withMeta.length > 0
  ? withMeta.reduce((acc: number, r: { compromisos: number; meta: number }) =>
      acc + (r.compromisos / r.meta) * 100, 0) / withMeta.length
  : null;

// Proyección simplificada (sin pesos configurables para no añadir complejidad):
const histCount = histRes.data?.length ?? 0;
const score_historial = histCount >= 2 ? 50 : histCount === 1 ? 40 : 30;
const score_termometros = t ? (t.term1 + t.term2 + t.term3 + t.term4 + t.term5) / 5 : 50;
const score_cobertura = coberturaPromedio ?? 0;
const RIESGO_SCORE: Record<string, number> = { critico: 10, alto: 40, medio: 70, bajo: 100 };
const score_competencia = RIESGO_SCORE[compRes.data?.riesgo_electoral ?? ""] ?? 50;
const puntuacion = Math.round((score_historial * 30 + score_termometros * 35 + score_cobertura * 25 + score_competencia * 10) / 100);
const nivel = puntuacion >= 75 ? "muy_alto" : puntuacion >= 55 ? "alto" : puntuacion >= 35 ? "medio" : "bajo";
```

Agrega al system prompt (después de la sección de planilla):
```
### Proyección electoral
${proy ? `Puntuación: ${proy.puntuacion}/100 — Nivel: ${proy.nivel}
  Scores: Historial=${proy.score_historial} Termómetros=${proy.score_termometros} Cobertura=${proy.score_cobertura} Competencia=${proy.score_competencia}` : "Sin proyección calculada."}

### Cobertura de secciones
${coberturaPromedio !== null ? `Promedio: ${coberturaPromedio.toFixed(1)}% compromisos vs meta (${withMeta.length} secciones con meta asignada)` : "Sin datos de cobertura."}

### Riesgo de competencia
${compRes.data?.riesgo_electoral ?? "Sin clasificar"}
```

Limitar historial enviado al LLM (antes de llamar a `streamText`):
```ts
const limitedMessages = messages.slice(-8);
// usar limitedMessages en streamText({ messages: limitedMessages, ... })
```

---

### `src/app/api/ai/inteligencia/route.ts` (nuevo)

```ts
import { streamText } from "ai";
import { MODEL_ANALISIS } from "@/lib/ai";
import { getUsuarioActual } from "@/actions/auth";
import { getSituacionGlobal } from "@/actions/situacion";

export async function POST(req: Request) {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { messages, municipioIds } = (await req.json()) as {
    messages: { role: "user" | "assistant"; content: string }[];
    municipioIds?: number[];
  };

  const { municipios } = await getSituacionGlobal();

  const scope = municipioIds?.length
    ? municipios.filter(m => municipioIds.includes(m.id))
    : municipios.slice(0, 8);

  const contexto = scope.map(m =>
    `- ${m.nombre}: proyección=${m.proyeccion ?? "N/D"}/100 nivel=${m.proyeccionNivel ?? "?"} ` +
    `termómetro=${m.avgTermometro?.toFixed(1) ?? "N/D"} ` +
    `prioridad=${m.prioridad ?? "N/D"} riesgo=${m.riesgo ?? "N/D"} ` +
    `aspirantes=${m.aspirantesCount} planilla=${m.planillaCount}`
  ).join("\n");

  const systemPrompt = `Eres un analista político estratégico experto en elecciones municipales del Estado de México.
Tienes acceso a los datos de los siguientes municipios del sistema SIPEEM:

${contexto}

Para preguntas sobre municipios no incluidos en la lista, indica que no tienes datos cargados para ese municipio.
Responde siempre en español. Sé conciso y estratégicamente útil. Usa Markdown para respuestas largas.`;

  const result = streamText({
    model: MODEL_ANALISIS as any,
    system: systemPrompt,
    messages: messages.slice(-8),
    maxOutputTokens: 1500,
  });

  return result.toUIMessageStreamResponse();
}
```

---

### `src/actions/inteligencia.ts` (nuevo)

```ts
"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";
import { redirect } from "next/navigation";
import { generateText } from "ai";
import { MODEL_RAPIDO } from "@/lib/ai";
import type { Message } from "@/lib/inteligencia-types";

export async function guardarSintesisIA(
  municipioId: number,
  messages: Message[]
): Promise<number> {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) redirect("/login");

  const intercambios = messages
    .filter(m => m.content.trim())
    .map(m => `${m.role === "user" ? "Analista" : "IA"}: ${m.content}`)
    .join("\n\n");

  const { text: contenido } = await generateText({
    model: MODEL_RAPIDO as any,
    system: "Eres un redactor político. Genera un resumen ejecutivo conciso.",
    prompt: `Resume la siguiente conversación de análisis electoral en un briefing ejecutivo claro y estructurado (máximo 300 palabras). Incluye: tema central, hallazgos clave y recomendaciones mencionadas.\n\n${intercambios}`,
    maxOutputTokens: 600,
  });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("briefings")
    .insert({
      municipio_id: municipioId,
      contenido: `[Síntesis de análisis IA]\n\n${contenido}`,
      generado_por: usuario.email,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data.id;
}
```

---

### `src/components/inteligencia/ChatArea.tsx` (nuevo)

Props:
```ts
interface Props {
  messages: Message[];
  loading: boolean;
  onSend: (text: string) => void;
  suggestions?: string[];
}
```

Extrae la UI de `AsistenteChat.tsx` tal como está: lista de mensajes con burbujas user/assistant, textarea con Enter-to-send, botón Send, scroll automático al último mensaje. Solo se abstrae en componente separado — sin cambios visuales.

---

### `src/components/inteligencia/ContextPanel.tsx` (nuevo)

Props:
```ts
interface Props {
  mode: "municipal" | "global";
  // municipal:
  kpis?: MunicipioKPIs | null;
  actoresData?: ActoresData | null;
  historialData?: HistorialItem[];
  // global:
  municipios?: { id: number; nombre: string }[];
  selectedIds?: number[];
  onSelectionChange?: (ids: number[]) => void;
  // común:
  onGuardar: () => void;
  canGuardar: boolean;
  saving: boolean;
}
```

Tabs en `mode="municipal"`: **KPIs** (proyección, termómetros T1-T5, cobertura%, riesgo) · **Actores** (comité, planilla top-5, aspirantes top-5) · **Historial** (últimas 3 elecciones)

Tabs en `mode="global"`: **Municipios** (selector con checkboxes, hasta 5; lista los seleccionados con sus KPIs principales) · **Resumen** (urgency ranking)

Botón "Guardar síntesis": deshabilitado cuando `!canGuardar || saving`.

---

### `src/components/inteligencia/InteligenciaChatShell.tsx` (nuevo)

Props:
```ts
interface Props {
  mode: "municipal" | "global";
  municipioId?: number;
  municipios?: { id: number; nombre: string }[];
  kpis?: MunicipioKPIs | null;
  actoresData?: ActoresData | null;
  historialData?: HistorialItem[];
}
```

Estado interno:
```ts
const [messages, setMessages] = useState<Message[]>([]);
const [selectedMunicipioIds, setSelectedMunicipioIds] = useState<number[]>(
  municipioId ? [municipioId] : []
);
const [loading, setLoading] = useState(false);
const [saving, setSaving] = useState(false);
const [canSave, setCanSave] = useState(false);
```

Al enviar mensaje:
1. Push mensaje `{ role: "user", content }` a `messages`
2. Push `{ role: "assistant", content: "" }` placeholder
3. `setLoading(true)`
4. Fetch POST a ruta correcta: `mode === "municipal"` → `/api/ai/municipio-context`; `mode === "global"` → `/api/ai/inteligencia`
5. Body: `{ messages: updatedMessages, municipioId }` o `{ messages: updatedMessages, municipioIds: selectedMunicipioIds }`
6. Leer stream (mismo bucle que AsistenteChat actual)
7. Actualizar último mensaje assistant con texto acumulado
8. `setLoading(false)`, `setCanSave(true)`

Al guardar:
- En `mode="municipal"`: llama `guardarSintesisIA(municipioId!, messages)` — `municipioId` siempre definido en este modo.
- En `mode="global"`: el botón "Guardar" solo está habilitado cuando `selectedMunicipioIds.length === 1`. Si hay 0 o >1 seleccionados, el botón muestra tooltip "Selecciona exactamente un municipio para guardar". Cuando está habilitado, llama `guardarSintesisIA(selectedMunicipioIds[0], messages)`.

```ts
const effectiveMunicipioId = mode === "municipal"
  ? municipioId!
  : selectedMunicipioIds.length === 1 ? selectedMunicipioIds[0] : undefined;

const canActuallySave = canSave && effectiveMunicipioId !== undefined;
```

Pasos:
1. `setSaving(true)`
2. Llama `guardarSintesisIA(effectiveMunicipioId!, messages)`
3. Toast con `sonner` (ya usado en el proyecto): `toast.success("Síntesis guardada en Briefings")`
4. `setSaving(false)`

Layout:
```tsx
<div className="flex h-full gap-4">
  <div className="w-72 shrink-0">
    <ContextPanel ... />
  </div>
  <div className="flex-1 min-w-0">
    <ChatArea ... />
  </div>
</div>
```

---

### `src/components/actores/ActoresTabs.tsx` (modificación)

```tsx
// Eliminar:
import AsistenteChat from "./AsistenteChat";

// Agregar:
import InteligenciaChatShell from "@/components/inteligencia/InteligenciaChatShell";
import type { MunicipioKPIs, ActoresData, HistorialItem } from "@/lib/inteligencia-types";
```

Agregar `nombre: string` a las props de `ActoresTabs` (la página padre ya conoce el nombre — lo obtiene de `getMunicipioStrategicFile` o del listado de municipios):

```tsx
// En ActoresTabs Props — agregar:
nombre: string;
```

Los datos `kpis`, `actoresData` e `historialData` se construyen inline a partir de las props ya disponibles en `ActoresTabs` (`actores`, `proyeccion`, `nombre`):

```tsx
const kpis: MunicipioKPIs = {
  nombre,  // nueva prop
  proyeccion: proyeccion ? { puntuacion: proyeccion.puntuacion, nivel: proyeccion.nivel } : null,
  termometros: actores.termometros
    ? { term1: actores.termometros.term1, term2: actores.termometros.term2,
        term3: actores.termometros.term3, term4: actores.termometros.term4,
        term5: actores.termometros.term5 }
    : null,
  coberturaPromedio: null,  // no disponible en props actuales — el servidor ya la manda al LLM
  riesgoElectoral: actores.competencia?.riesgo_electoral ?? null,
  estrategia: null,         // no disponible en props actuales de ActoresTabs
};
```

Nota: `coberturaPromedio` y `estrategia` no están en las props actuales de `ActoresTabs`. El `ContextPanel` los muestra como "N/D" en el panel visual; la ruta del API sí los tiene. No se requiere cambio en las props de `ActoresTabs` para el MVP.

```tsx
<TabsContent value="asistente">
  <InteligenciaChatShell
    mode="municipal"
    municipioId={municipioId}
    kpis={kpis}
    actoresData={{ comite: actores.comite, planilla: actores.planilla, aspirantes: actores.aspirantes }}
    historialData={[]}
  />
</TabsContent>
```

`historialData=[]` porque `ActoresTabs` no recibe datos de historial electoral (vienen de `getMunicipioStrategicFile`, no de `getActoresMunicipio`). El tab "Historial" en `ContextPanel` mostrará un estado vacío explícito cuando `historialData.length === 0`:

```tsx
{historialData.length === 0 ? (
  <p className="text-xs text-slate-400 text-center py-4">
    Historial disponible en la ficha de Estrategia Municipal
  </p>
) : (
  // tabla de elecciones
)}
```

No se pasa historial como prop a `ActoresTabs` — el dato ya está disponible para el LLM vía `municipio-context/route.ts` que sí lo carga.

---

### `src/app/(protected)/admin/inteligencia/page.tsx` (nuevo)

```tsx
import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "@/actions/auth";
import { redirect } from "next/navigation";
import InteligenciaChatShell from "@/components/inteligencia/InteligenciaChatShell";

export default async function InteligenciaPage() {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) redirect("/login");

  const svc = createServiceClient();
  const { data: municipios } = await svc
    .from("municipios")
    .select("id, nombre")
    .eq("estatus", "activo")
    .order("nombre");

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      <div>
        <h1 className="text-xl font-black text-slate-900 tracking-tight">Inteligencia Electoral</h1>
        <p className="text-sm text-slate-500 mt-1">Análisis comparativo cross-municipio con IA</p>
      </div>
      <div className="flex-1 min-h-0">
        <InteligenciaChatShell
          mode="global"
          municipios={municipios ?? []}
        />
      </div>
    </div>
  );
}
```

---

### `src/components/layout/SidebarNav.tsx` (modificación)

```tsx
import { Brain } from "lucide-react";
const isInteligencia = pathname.startsWith("/admin/inteligencia");

// Insertar después del link "Sala de Situación":
<Link href="/admin/inteligencia" className={itemClass(isInteligencia)}>
  <span className={iconClass(isInteligencia, "bg-violet-600/20 text-violet-300")}>
    <Brain className="h-4 w-4" />
  </span>
  Inteligencia IA
</Link>
```

---

## Manejo de errores

| Escenario | Comportamiento |
|-----------|---------------|
| Streaming falla | Burbuja de error en chat, conversación puede continuar |
| Municipio sin datos parciales | Ruta indica "sin datos" por dimensión, IA responde con lo disponible |
| Modo global sin municipios seleccionados | Top-8 por urgency cargado automáticamente |
| Guardar sin conversación | Botón deshabilitado hasta ≥ 1 intercambio completo |
| Rol insuficiente | Route Handler devuelve 401; acción devuelve redirect("/login") |
| Pregunta sobre municipio fuera del contexto global | IA indica que no tiene datos para ese municipio |

---

## Política de contexto

- **Historial al LLM**: `messages.slice(-8)` antes de cada llamada a `streamText`
- **Municipios en modo global**: máx. 8 automáticos; usuario puede seleccionar hasta 5 explícitos
- **System prompt**: construido en el servidor siempre — nunca llega del cliente

---

## Lo que NO cambia

- `lib/ai.ts` (MODEL_ANALISIS, MODEL_RAPIDO, generateAnalysis)
- Tabla `briefings` (se reutiliza; síntesis marcada con prefijo `[Síntesis de análisis IA]`)
- Schema de base de datos (sin nuevas tablas)
- Dependencias npm
- `/api/ai/chat/route.ts`
- Cualquier otro módulo existente

---

## Orden de implementación

1. Crear `src/lib/inteligencia-types.ts`
2. Enriquecer `src/app/api/ai/municipio-context/route.ts` (cobertura, proyección, competencia, límite 8 msgs)
3. Crear `src/app/api/ai/inteligencia/route.ts` (modo global)
4. Crear `src/actions/inteligencia.ts` — `guardarSintesisIA`
5. Crear `src/components/inteligencia/ChatArea.tsx` (extraer UI de AsistenteChat)
6. Crear `src/components/inteligencia/ContextPanel.tsx`
7. Crear `src/components/inteligencia/InteligenciaChatShell.tsx`
8. Modificar `src/components/actores/ActoresTabs.tsx` — sustituir AsistenteChat
9. Eliminar `src/components/actores/AsistenteChat.tsx`
10. Crear `src/app/(protected)/admin/inteligencia/page.tsx`
11. Modificar `src/components/layout/SidebarNav.tsx`
12. Validar end-to-end: tab municipal funciona + panel de contexto; vista global responde con contexto cross-municipio; guardar produce síntesis en briefings
