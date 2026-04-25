# Motor de Inteligencia Electoral — SIPEEM Design Spec
Date: 2026-04-24

## Objetivo

Motor de análisis conversacional que permite al director/admin hacer preguntas en lenguaje natural sobre cualquier municipio y recibir respuestas basadas en los datos reales del sistema: historial electoral, proyecciones, termómetros, cobertura de secciones, actores políticos y estrategia. Con historial de conversación en sesión y capacidad de guardar análisis.

---

## Decisiones de diseño

| Decisión | Elección | Razón |
|----------|----------|-------|
| Patrón de interacción | Panel + Chat Integrado | Contexto visible mientras se chatea |
| Ubicación | Global (`/admin/inteligencia`) + tab en Estrategia Municipal | Análisis cross-municipio y contextual |
| Layout panel | Tabs: KPIs · Actores · Historial | Equilibrio densidad/orden |
| Historial | Client-side `useState<Message[]>` | Suficiente para sesiones cortas, sin DB extra |
| Respuestas | Bloqueante (spinner + texto completo) | Consistente con briefings existentes |
| Guardado | Tabla `briefings` existente | Sin nuevas tablas |

---

## Arquitectura

```
Cliente (React)
  useState<Message[]>          ← historial en memoria (resetea al cambiar página)
  useState<number | null>      ← municipioId seleccionado

  onSubmit(userText)
    → Server Action: consultarInteligencia(messages, municipioId?)
        ← carga contexto del municipio desde Supabase
        ← construye system prompt con todos los datos
        ← llama generateText({ model, system, messages })
        → devuelve { text: string }
    → push assistant message al array local
    → render

Dos entry points (mismos componentes):
  /admin/inteligencia              → selector de municipio libre
  /admin/estrategia-municipal/[id] → tab "IA" con municipioId fijo
```

---

## Contexto que recibe la IA (por municipio)

Cuando hay `municipioId`, el system prompt incluye:

- **Proyección**: puntuación (0-100), nivel (bajo/medio/alto/muy_alto), scores parciales (historial, termómetros, cobertura, competencia)
- **Tendencia ML**: margen_tendencia, r_squared, confianza
- **Termómetros**: T1 (org. interna), T2 (competitividad), T3 (presencia territorial), T4 (movilización), T5 (imagen) — escala 0-100
- **Cobertura**: % promedio de compromisos vs meta en secciones con meta > 0
- **Actores**: comité (presidente, secretario), planilla (cargos y nombres), aspirantes (nombre, cargo, partido)
- **Historial electoral**: últimas 3 elecciones (año, partido ganador, % del ganador)
- **Competencia**: riesgo electoral (bajo/medio/alto/crítico)
- **Estrategia**: prioridad, riesgo, oportunidad, estatus, notas ejecutivas, notas operativas

Cuando **no hay** `municipioId` (modo global), el system prompt incluye los top-5 municipios por `urgencyScore` de `getSituacionGlobal()` con sus KPIs clave, para análisis comparativo.

---

## Tipos

```ts
// Compartido entre acción y componentes
export type Message = {
  role: "user" | "assistant";
  content: string;
};

// Datos del municipio para el panel de contexto
export type MunicipioContextData = {
  nombre: string;
  proyeccion: { puntuacion: number; nivel: string; score_historial: number; score_termometros: number; score_cobertura: number; score_competencia: number } | null;
  tendenciaML: { margen_tendencia: number; r_squared: number; confianza: string } | null;
  termometros: { term1: number; term2: number; term3: number; term4: number; term5: number } | null;
  coberturaPromedio: number | null;
  comite: { presidente: string; secretario: string } | null;
  planilla: { cargo: string; nombre: string }[];
  aspirantes: { nombre: string; cargo_aspirado: string; partido: string }[];
  historial: { anio: number; partido_ganador_id: number; porcentaje_ganador: number }[];
  riesgoElectoral: string | null;
  estrategia: { prioridad: string; riesgo: string; estatus: string; notas_ejecutivas: string } | null;
};
```

---

## Archivos afectados

### Nuevos

| Archivo | Responsabilidad |
|---------|----------------|
| `src/actions/inteligencia.ts` | Server Action `consultarInteligencia(messages, municipioId?)` |
| `src/components/inteligencia/ChatPanel.tsx` | UI de chat: lista mensajes, input, spinner, llama la acción |
| `src/components/inteligencia/ContextPanel.tsx` | Panel izquierdo: selector municipio, tabs KPIs/Actores/Historial, botón Guardar |
| `src/app/(protected)/admin/inteligencia/page.tsx` | Page global: carga municipios activos, layout 30/70 |

### Modificados

| Archivo | Cambio |
|---------|--------|
| `src/app/(protected)/admin/estrategia-municipal/[id]/page.tsx` | Agrega tab "IA" que monta `ChatPanel` con `municipioId` fijo |
| `src/components/layout/SidebarNav.tsx` | Nueva entrada "Inteligencia IA" con ícono `Brain` de lucide-react |

---

## Detalle por archivo

### `src/actions/inteligencia.ts`

```ts
"use server";

import { generateText } from "ai";
import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";
import { redirect } from "next/navigation";
import { getSituacionGlobal } from "./situacion";
import { MODEL_ANALISIS } from "@/lib/ai";

export type Message = { role: "user" | "assistant"; content: string };

async function buildMunicipioContext(municipioId: number): Promise<string> {
  // Carga datos en paralelo y devuelve string con este formato:
  // === MUNICIPIO: Ecatepec (ID: 123) ===
  // PROYECCIÓN: 72/100 — Nivel: alto
  //   Scores: Historial=50 Termómetros=68 Cobertura=45 Competencia=70
  // TENDENCIA ML: margen=61.3% R²=0.74 confianza=alta
  // TERMÓMETROS (0-100): T1(org)=48 T2(competit)=61 T3(presencia)=55 T4(movil)=70 T5(imagen)=71
  // COBERTURA SECCIONES: 45% promedio (compromisos/meta)
  // HISTORIAL: 2021=MORENA 54.2% | 2018=PRI 48.1% | 2015=PRI 51.0%
  // RIESGO COMPETENCIA: extremo
  // ESTRATEGIA: Prioridad=Crítica Riesgo=Extremo Estatus=En proceso
  //   Notas ejecutivas: [texto]
}

async function buildGlobalContext(): Promise<string> {
  // Usa getSituacionGlobal() → top 5 por urgencyScore
  // Devuelve string con resumen cross-municipio
}

export async function guardarAnalisisIA(
  municipioId: number,
  messages: Message[],
  generadoPor: string
): Promise<number> {
  // Formatea messages como texto: "Usuario: ...\nAsistente: ..."
  // Inserta en briefings: { municipio_id, contenido, generado_por }
  // Devuelve id del briefing creado
}

export async function consultarInteligencia(
  messages: Message[],
  municipioId?: number
): Promise<string> {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) redirect("/login");

  const contexto = municipioId
    ? await buildMunicipioContext(municipioId)
    : await buildGlobalContext();

  const systemPrompt = `Eres un analista político experto en elecciones municipales del Estado de México integrado en SIPEEM.
Tienes acceso a los siguientes datos reales del sistema:

${contexto}

Responde con precisión usando solo los datos proporcionados. Sé directo, usa lenguaje político operativo. En español. Máximo 400 palabras.`;

  const { text } = await generateText({
    model: MODEL_ANALISIS as any,
    system: systemPrompt,
    messages,
    maxOutputTokens: 1000,
    temperature: 0.3,
  });

  return text;
}
```

### `src/components/inteligencia/ChatPanel.tsx`

Cliente. Props:
```ts
interface Props {
  municipioId?: number;
  initialMessages?: Message[];
}
```

Estado interno:
```ts
const [messages, setMessages] = useState<Message[]>(initialMessages ?? []);
const [input, setInput] = useState("");
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
```

Al enviar:
1. Push mensaje `user` al array
2. `setLoading(true)`
3. Llama `consultarInteligencia(updatedMessages, municipioId)`
4. Push respuesta como mensaje `assistant`
5. `setLoading(false)`
6. Si falla: muestra burbuja de error, el usuario puede reintentar

### `src/components/inteligencia/ContextPanel.tsx`

Cliente. Props:
```ts
interface Props {
  municipios: { id: number; nombre: string }[];
  municipioId: number | null;
  onMunicipioChange: (id: number | null) => void;
  onGuardar: () => void;
  canGuardar: boolean;   // true cuando hay ≥1 intercambio
  data: MunicipioContextData | null;  // null cuando no hay municipio seleccionado
  loading: boolean;
}
```

Tabs: KPIs (proyección, ML, termómetros, cobertura, riesgo) · Actores (comité, planilla, aspirantes) · Historial (últimas 3 elecciones).

El botón "Guardar" llama a `guardarAnalisisIA(municipioId, contenido, generadoPor)` — nueva función en `inteligencia.ts` que inserta directamente en la tabla `briefings` con el texto de la conversación formateado como briefing. No llama a `generarBriefing` (que genera su propio contenido desde el LLM).

### `src/app/(protected)/admin/inteligencia/page.tsx`

Server Component. Carga `municipios` activos. Renderiza:
```tsx
<div className="flex h-full">
  <ContextPanel municipios={municipios} ... />   {/* ~30% */}
  <ChatPanel ... />                              {/* ~70% */}
</div>
```

### Tab "IA" en Estrategia Municipal

Dentro del array de tabs existente en `estrategia-municipal/[id]/page.tsx`, agregar:
```tsx
{ key: "ia", label: "Inteligencia IA", content: <ChatPanel municipioId={id} /> }
```

El `ContextPanel` en esta vista usa `municipioId` fijo y no muestra selector.

### `SidebarNav.tsx`

```tsx
import { Brain } from "lucide-react";
// ...
const isInteligencia = pathname.startsWith("/admin/inteligencia");
// ...
<Link href="/admin/inteligencia" className={itemClass(isInteligencia)}>
  <span className={iconClass(isInteligencia, "bg-violet-600/20 text-violet-300")}>
    <Brain className="h-4 w-4" />
  </span>
  Inteligencia IA
</Link>
```

---

## Datos que `buildMunicipioContext` carga en paralelo

No reutiliza `getProyeccionMunicipios()` (cargaría los 125 municipios). Hace queries directas:

```ts
const [termRes, histRes, cobRes, compRes, estRes, comiteRes, planillaRes, aspirantesRes, munRes] =
  await Promise.all([
    svc.from("termometros").select("term1,term2,term3,term4,term5").eq("municipio_id", municipioId).maybeSingle(),
    svc.from("historial_electoral").select("anio,partido_ganador_id,porcentaje_ganador")
       .eq("municipio_id", municipioId).order("anio", { ascending: false }).limit(3),
    svc.from("compromisos_seccion").select("compromisos,meta").eq("municipio_id", municipioId),
    svc.from("competencia_municipal").select("riesgo_electoral").eq("municipio_id", municipioId).maybeSingle(),
    svc.from("estrategia_municipal").select("prioridad,riesgo,estatus,notas_ejecutivas").eq("municipio_id", municipioId).maybeSingle(),
    svc.from("comite_municipal").select("presidente,secretario").eq("municipio_id", municipioId).maybeSingle(),
    svc.from("planilla").select("cargo,nombre").eq("municipio_id", municipioId).order("cargo"),
    svc.from("aspirantes").select("nombre,cargo_aspirado,partido").eq("municipio_id", municipioId),
    svc.from("municipios").select("nombre").eq("id", municipioId).single(),
  ]);
```

Cobertura promedio: `rows.filter(r => r.meta > 0).reduce(...)` — igual que `proyeccion.ts:56-61`.

La proyección numérica **no se recalcula** en `buildMunicipioContext` para no duplicar lógica compleja. En su lugar el system prompt describe los componentes raw (termómetros, cobertura, historial, competencia) y deja que la IA interprete. Si se requiere la puntuación numérica, `getMunicipioContextData` (función auxiliar en `inteligencia.ts`) puede llamar a `getProyeccionMunicipios()` y filtrar por `municipio_id`.

---

## Manejo de errores

| Escenario | Comportamiento |
|-----------|---------------|
| LLM falla | Burbuja de error en chat, conversación puede continuar |
| Municipio sin datos parciales | System prompt indica "sin datos" por dimensión, IA responde con lo disponible |
| Modo global sin municipio | Contexto cross-municipio con top-5 por urgency |
| Guardar sin conversación | Botón deshabilitado |
| Rol insuficiente | `redirect("/login")` en Server Action |
| Cambio de municipio | Historial se resetea, contexto nuevo |

---

## Lo que NO cambia

- Tabla `briefings` (se reutiliza para guardar)
- `lib/ai.ts` y `MODEL_ANALISIS`
- Rutas de API existentes
- Schema de base de datos (sin nuevas tablas)
- Dependencias npm
- Cualquier otra página o acción existente

---

## Orden de implementación

1. `src/actions/inteligencia.ts` — `consultarInteligencia` + `buildMunicipioContext` + `buildGlobalContext`
2. `src/components/inteligencia/ChatPanel.tsx`
3. `src/components/inteligencia/ContextPanel.tsx`
4. `src/app/(protected)/admin/inteligencia/page.tsx`
5. Agregar tab "IA" en `estrategia-municipal/[id]/page.tsx`
6. Agregar entrada en `SidebarNav.tsx`
7. Validar end-to-end: seleccionar municipio → preguntar → recibir respuesta → guardar
