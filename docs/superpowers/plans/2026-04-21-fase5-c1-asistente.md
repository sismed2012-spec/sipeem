# Asistente de Estrategia Municipal (AI Chat) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chat con IA por municipio donde el usuario puede hacer preguntas estratégicas y el asistente responde con contexto completo del municipio: historial electoral, termómetros, escenarios, aspirantes, comité, incidencias.

**Architecture:** Route Handler `/api/ai/chat` (streaming) ya creado en Fase 5 Setup. Nuevo tab "Asistente" en `ActoresTabs`. Client Component `AsistenteChat` que construye el systemPrompt con los datos del municipio y usa `fetch` al route handler para streaming. Sin librerías de chat — implementación manual con `ReadableStream`.

**Tech Stack:** `ai` v6 · Vercel AI Gateway · `anthropic/claude-sonnet-4.6` (dots, not hyphens) · Route Handler streaming · Next.js Client Component

---

## PREREQUISITO: Fase 5 Setup completada

El módulo `src/lib/ai.ts` y el route handler `/api/ai/chat` deben existir.

---

## Context

- Proyecto en `M:/SIPPEEM/sipeem/`
- NO hay git — NO hacer commits
- Verificar API actual de streaming: `grep -r "useChat\|ReadableStream" node_modules/ai/docs/ 2>/dev/null | head -10`
- El systemPrompt se construye en el servidor para no exponer datos en el cliente
- Los datos del municipio llegan como props al componente desde el Server Component padre

## File Map

| Archivo | Acción |
|---------|--------|
| `src/app/api/ai/municipio-context/route.ts` | Crear — endpoint que construye el system prompt con datos del municipio |
| `src/components/actores/AsistenteChat.tsx` | Crear — UI de chat streaming (Client Component) |
| `src/components/actores/ActoresTabs.tsx` | Modificar — agregar tab "Asistente" |

---

### Task 1: Endpoint de contexto municipal

**Files:**
- Create: `src/app/api/ai/municipio-context/route.ts`

- [ ] **Step 1: Crear el route handler**

Este endpoint recibe `municipioId`, agrega todos los datos del municipio, construye un systemPrompt rico y hace streaming de la respuesta.

```typescript
// src/app/api/ai/municipio-context/route.ts
import { streamText } from "ai";
import { MODEL_ANALISIS } from "@/lib/ai";
import { getUsuarioActual } from "@/actions/auth";
import { getMunicipioStrategicFile } from "@/actions/estrategia";
import { getActoresMunicipio } from "@/actions/actores";

export async function POST(req: Request) {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { municipioId, messages } = (await req.json()) as {
    municipioId: number;
    messages: { role: "user" | "assistant"; content: string }[];
  };

  // Fetch all municipal data in parallel
  const [{ estrategia, electoral }, actores] = await Promise.all([
    getMunicipioStrategicFile(municipioId),
    getActoresMunicipio(municipioId),
  ]);

  const nombre = electoral?.summary?.nombre ?? `Municipio ${municipioId}`;
  const timeline = electoral?.timeline?.slice(0, 3) ?? [];

  // Build rich system prompt from all available data
  const systemPrompt = `Eres un analista político estratégico experto en elecciones municipales del Estado de México. 
Estás analizando el municipio de ${nombre}.

## DATOS DEL MUNICIPIO

### Estrategia actual
${estrategia ? `
- Prioridad: ${estrategia.prioridad}
- Riesgo político: ${estrategia.riesgo}
- Oportunidad: ${estrategia.oportunidad}
- Estatus: ${estrategia.estatus}
- Responsable: ${estrategia.responsable ?? "No asignado"}
- Notas ejecutivas: ${estrategia.notas_ejecutivas ?? "Sin notas"}
- Notas operativas: ${estrategia.notas_operativas ?? "Sin notas"}
` : "Sin ficha estratégica registrada."}

### Historial electoral reciente
${timeline.length > 0 ? timeline.map(t => 
  `- ${t.anio}: Ganó ${t.winnerSiglas} con ${t.porcentaje?.toFixed(1) ?? "?"}% (margen: ${t.margin?.toLocaleString() ?? "?"} votos)`
).join("\n") : "Sin historial electoral disponible."}

### Termómetros políticos (escala 0 a 100)
${actores.termometros ? 
  `T1=${actores.termometros.term1} T2=${actores.termometros.term2} T3=${actores.termometros.term3} T4=${actores.termometros.term4} T5=${actores.termometros.term5}
  Promedio: ${((actores.termometros.term1+actores.termometros.term2+actores.termometros.term3+actores.termometros.term4+actores.termometros.term5)/5).toFixed(1)}`
: "Sin termómetros registrados."}

### Comité municipal
${actores.comite ? 
  `Presidente: ${actores.comite.presidente} | Secretario: ${actores.comite.secretario} | Inaugurado: ${actores.comite.inaugurado ? "Sí" : "No"}`
: "Sin comité registrado."}

### Aspirantes registrados (${actores.aspirantes.length})
${actores.aspirantes.slice(0, 5).map(a => 
  `- ${a.nombre} (${a.cargo_aspirado}, ${a.partido})`
).join("\n") || "Ninguno."}

### Planilla de candidatos (${actores.planilla.length} integrantes)
${actores.planilla.slice(0, 5).map(p => `- ${p.cargo}: ${p.nombre} (${p.partido})`).join("\n") || "Sin planilla registrada."}

## INSTRUCCIONES
- Responde SIEMPRE en español
- Sé conciso y estratégicamente útil
- Basa tus análisis en los datos anteriores
- Si no hay datos suficientes en alguna área, indícalo
- Usa formato Markdown para respuestas largas`;

  const result = streamText({
    model: MODEL_ANALISIS,
    system: systemPrompt,
    messages,
    maxTokens: 1500,
  });

  return result.toUIMessageStreamResponse();
}
```

**Nota:** Si `toUIMessageStreamResponse()` no existe, buscar en `node_modules/ai/src/` el método correcto.

---

### Task 2: Componente `AsistenteChat`

**Files:**
- Create: `src/components/actores/AsistenteChat.tsx`

- [ ] **Step 1: Verificar si hay `useChat` hook disponible**

```bash
grep -r "useChat" M:/SIPPEEM/sipeem/node_modules/ai/src/ 2>/dev/null | grep "export" | head -5
```

Si `useChat` está disponible en `ai`, usarlo. Si no, implementar manualmente.

- [ ] **Step 2: Crear el componente**

```tsx
// src/components/actores/AsistenteChat.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Bot, User } from "lucide-react";

type Message = { role: "user" | "assistant"; content: string };

type Props = { municipioId: number };

export default function AsistenteChat({ municipioId }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    // Add empty assistant message for streaming
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/ai/municipio-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ municipioId, messages: newMessages }),
      });

      if (!res.ok) throw new Error(`Error ${res.status}`);
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        // Parse AI SDK streaming format (data: prefix lines)
        for (const line of chunk.split("\n")) {
          if (line.startsWith("0:")) {
            try {
              const text = JSON.parse(line.slice(2));
              if (typeof text === "string") {
                assistantText += text;
                setMessages((prev) => [
                  ...prev.slice(0, -1),
                  { role: "assistant", content: assistantText },
                ]);
              }
            } catch {
              // Skip malformed lines
            }
          }
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { role: "assistant", content: `Error: ${err instanceof Error ? err.message : "Sin respuesta"}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-[500px]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-2 mb-4">
        {messages.length === 0 && (
          <div className="text-center py-12 space-y-2">
            <Bot className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm text-slate-400">
              Pregunta sobre la estrategia, riesgos, aspirantes o cualquier aspecto de este municipio.
            </p>
            <div className="flex flex-wrap gap-2 justify-center mt-4">
              {[
                "¿Cuáles son los principales riesgos?",
                "¿Qué me dicen los termómetros?",
                "¿Cómo está la estructura de actores?",
              ].map((sugg) => (
                <button
                  key={sugg}
                  onClick={() => setInput(sugg)}
                  className="text-xs px-3 py-1.5 rounded-full border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition-colors"
                >
                  {sugg}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot className="w-3.5 h-3.5 text-indigo-600" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-slate-900 text-white rounded-tr-sm"
                  : "bg-slate-100 text-slate-800 rounded-tl-sm"
              }`}
            >
              {msg.content || (loading && i === messages.length - 1 ? "▋" : "")}
            </div>
            {msg.role === "user" && (
              <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                <User className="w-3.5 h-3.5 text-slate-600" />
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="flex gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend(e);
            }
          }}
          placeholder="Pregunta sobre este municipio... (Enter para enviar)"
          rows={2}
          className="flex-1 rounded-xl border-slate-200 text-sm resize-none"
          disabled={loading}
        />
        <Button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-xl bg-indigo-600 hover:bg-indigo-700 self-end h-10 w-10 p-0"
        >
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
}
```

---

### Task 3: Integrar en `ActoresTabs`

- [ ] **Step 1: Agregar tab**

En `src/components/actores/ActoresTabs.tsx`:
1. `import AsistenteChat from "./AsistenteChat"`
2. `<TabsTrigger value="asistente">Asistente IA</TabsTrigger>`
3. `<TabsContent value="asistente"><AsistenteChat municipioId={municipioId} /></TabsContent>`

- [ ] **Step 2: Verificar build**

```bash
cd M:/SIPPEEM/sipeem && npm run build 2>&1 | tail -20
```
