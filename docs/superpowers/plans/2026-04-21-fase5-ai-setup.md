# Setup AI SDK (Vercel AI Gateway) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instalar el AI SDK v6 de Vercel, configurar autenticación vía AI Gateway, y crear el cliente compartido `src/lib/ai.ts` que todos los módulos de Fase 5+ usarán.

**Architecture:** Paquete `ai` con routing automático a través del Vercel AI Gateway usando strings `"provider/model"`. Sin keys de proveedor directas — autenticación vía `AI_GATEWAY_API_KEY`. Un módulo `src/lib/ai.ts` con helpers para análisis (non-streaming) y un Route Handler para chat streaming.

**Tech Stack:** `ai` v6 (Vercel AI SDK) · Vercel AI Gateway · `anthropic/claude-sonnet-4.6` como modelo base

---

## Context

- Proyecto en `M:/SIPPEEM/sipeem/`
- NO hay git — NO hacer commits
- AI Gateway: strings `"provider/model"` ruteadas automáticamente — NO usar `@ai-sdk/anthropic` directamente
- Modelo a usar: `anthropic/claude-sonnet-4.6` (dots, no hyphens en versión)
- Leer `node_modules/ai/docs/` después de instalar para verificar APIs actuales

---

### PREREQUISITO: Autenticación con AI Gateway

**Opción A — OIDC (recomendada, rotación automática):**
```bash
# 1. Linkear proyecto a Vercel (si no está hecho)
vercel link

# 2. Habilitar AI Gateway en Vercel Dashboard:
#    https://vercel.com/{team}/{project}/settings → AI Gateway

# 3. Provisionar token OIDC (~24h de vida, sin rotación manual)
vercel env pull .env.local
```
`VERCEL_OIDC_TOKEN` quedará en `.env.local`. El SDK lo usa automáticamente. Al vencer: re-ejecutar `vercel env pull`.

**Opción B — API Key estática (para CI o entornos sin Vercel CLI):**

Agregar a `M:/SIPPEEM/sipeem/.env.local`:
```
AI_GATEWAY_API_KEY=tu_clave_del_gateway
```
La clave se obtiene en: Vercel Dashboard → Settings → AI Gateway → API Keys.

---

### Task 1: Instalar dependencias

- [ ] **Step 1: Instalar paquete `ai`**

```bash
cd M:/SIPPEEM/sipeem && npm install ai
```

Esperado: `ai` v6.x aparece en `package.json`. NO instalar `@ai-sdk/anthropic` — el gateway lo maneja.

- [ ] **Step 2: Verificar que la instalación incluyó los docs**

```bash
ls M:/SIPPEEM/sipeem/node_modules/ai/docs/ 2>/dev/null && echo "docs found" || echo "no bundled docs"
```

Si hay docs, leerlos antes de escribir código: `node_modules/ai/docs/`

---

### Task 2: Módulo `src/lib/ai.ts`

**Files:**
- Create: `src/lib/ai.ts`

- [ ] **Step 1: Verificar la API actual de `generateText` y `streamText` en los docs**

```bash
grep -r "generateText" M:/SIPPEEM/sipeem/node_modules/ai/docs/ 2>/dev/null | head -5
grep -r "streamText" M:/SIPPEEM/sipeem/node_modules/ai/docs/ 2>/dev/null | head -5
```

- [ ] **Step 2: Crear el módulo**

```typescript
// src/lib/ai.ts
import { generateText } from "ai";

/** Modelo por defecto para análisis político — ruteado vía AI Gateway */
export const MODEL_ANALISIS = "anthropic/claude-sonnet-4.6";

/** Modelo económico para clasificaciones simples */
export const MODEL_RAPIDO = "anthropic/claude-haiku-4.5";

/**
 * Genera texto (non-streaming) para análisis y briefings.
 * El string "provider/model" es ruteado automáticamente por el AI SDK a través del Vercel AI Gateway.
 */
export async function generateAnalysis(
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  const { text } = await generateText({
    model: MODEL_ANALISIS,
    system:
      systemPrompt ??
      "Eres un analista político experto en elecciones municipales del Estado de México. Eres preciso, conciso y objetivo.",
    prompt,
    maxTokens: 1500,
    temperature: 0.3,
  });
  return text;
}
```

---

### Task 3: Route Handler para streaming (chat)

**Files:**
- Create: `src/app/api/ai/chat/route.ts`

- [ ] **Step 1: Verificar el API de streaming en los docs locales**

```bash
grep -r "toUIMessageStreamResponse\|toTextStreamResponse\|streamText" M:/SIPPEEM/sipeem/node_modules/ai/docs/ 2>/dev/null | grep -i "response" | head -10
```

- [ ] **Step 2: Crear route handler**

```typescript
// src/app/api/ai/chat/route.ts
import { streamText } from "ai";
import { MODEL_ANALISIS } from "@/lib/ai";
import { getUsuarioActual } from "@/actions/auth";

export async function POST(req: Request) {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { messages, systemPrompt } = (await req.json()) as {
    messages: { role: "user" | "assistant"; content: string }[];
    systemPrompt?: string;
  };

  const result = streamText({
    model: MODEL_ANALISIS,
    system:
      systemPrompt ??
      "Eres un analista político experto en elecciones municipales del Estado de México.",
    messages,
    maxTokens: 2000,
  });

  // En AI SDK v6 el método es toUIMessageStreamResponse() para chat UIs
  // Si da error de tipo, verificar en node_modules/ai/docs/ el método correcto para la versión instalada
  return result.toUIMessageStreamResponse();
}
```

**Nota para el implementador:** Si `toUIMessageStreamResponse()` no existe en la versión instalada, buscar en `node_modules/ai/src/` el método de streaming correcto (`grep -r "toUIMessage\|toDataStream\|toText" node_modules/ai/src/ | grep "StreamResponse"`) y usar ese.

---

### Task 4: Verificar integración

- [ ] **Step 1: Test de build con typecheck**

```bash
cd M:/SIPPEEM/sipeem && npx tsc --noEmit 2>&1 | grep -v "analytics.ts" | head -20
```

Si hay errores de tipo en `src/lib/ai.ts` o `src/app/api/ai/chat/route.ts`, buscar la API correcta en `node_modules/ai/src/` y corregir.

- [ ] **Step 2: Test manual del módulo (con servidor corriendo)**

Crear temporalmente `src/app/api/ai/test/route.ts`:

```typescript
import { generateAnalysis } from "@/lib/ai";
export async function GET() {
  try {
    const text = await generateAnalysis("Responde solo: OK");
    return Response.json({ ok: true, text });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
```

Con `npm run dev` activo, visitar `http://localhost:3000/api/ai/test`.
Esperado: `{ "ok": true, "text": "OK" }`.

**Eliminar** `src/app/api/ai/test/route.ts` después de verificar.

- [ ] **Step 3: Verificar build final**

```bash
cd M:/SIPPEEM/sipeem && npm run build 2>&1 | tail -20
```
