"use client";

import { useState } from "react";
import { toast } from "sonner";
import { guardarSintesisIA } from "@/actions/inteligencia";
import ContextPanel from "./ContextPanel";
import ChatArea from "./ChatArea";
import type {
  Message,
  MunicipioKPIs,
  ActoresData,
  HistorialItem,
} from "@/lib/inteligencia-types";

interface Props {
  mode: "municipal" | "global";
  municipioId?: number;
  municipios?: { id: number; nombre: string }[];
  kpis?: MunicipioKPIs | null;
  actoresData?: ActoresData | null;
  historialData?: HistorialItem[];
}

const MUNICIPAL_SUGGESTIONS = [
  "¿Cuáles son los principales riesgos?",
  "¿Qué me dicen los termómetros?",
  "¿Cómo está la estructura de actores?",
];

const GLOBAL_SUGGESTIONS = [
  "¿Qué municipios tienen mayor riesgo?",
  "¿Dónde concentrar esfuerzos esta semana?",
  "Compara la proyección de los municipios seleccionados",
];

export default function InteligenciaChatShell({
  mode,
  municipioId,
  municipios = [],
  kpis,
  actoresData,
  historialData = [],
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedMunicipioIds, setSelectedMunicipioIds] = useState<number[]>(
    municipioId ? [municipioId] : []
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [canSave, setCanSave] = useState(false);

  // In municipal mode: always the fixed municipioId.
  // In global mode: only valid when exactly 1 municipio is selected.
  const effectiveMunicipioId =
    mode === "municipal"
      ? municipioId!
      : selectedMunicipioIds.length === 1
      ? selectedMunicipioIds[0]
      : undefined;

  const canActuallySave = canSave && effectiveMunicipioId !== undefined;

  async function handleSend(content: string) {
    const userMsg: Message = { role: "user", content };
    const updatedMessages = [...messages, userMsg];
    setMessages([...updatedMessages, { role: "assistant", content: "" }]);
    setLoading(true);

    const url =
      mode === "municipal"
        ? "/api/ai/municipio-context"
        : "/api/ai/inteligencia";

    const body =
      mode === "municipal"
        ? { messages: updatedMessages.slice(-8), municipioId }
        : {
            messages: updatedMessages.slice(-8),
            municipioIds: selectedMunicipioIds,
          };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
        for (const line of chunk.split("\n")) {
          if (line.startsWith("0:")) {
            try {
              const parsed = JSON.parse(line.slice(2));
              if (typeof parsed === "string") {
                assistantText += parsed;
                setMessages((prev) => [
                  ...prev.slice(0, -1),
                  { role: "assistant", content: assistantText },
                ]);
              }
            } catch {
              // skip malformed lines
            }
          }
        }
      }
      setCanSave(true);
    } catch (err) {
      setMessages((prev) => [
        ...prev.slice(0, -1),
        {
          role: "assistant",
          content: `Error: ${
            err instanceof Error ? err.message : "Sin respuesta"
          }`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleGuardar() {
    if (!canActuallySave) return;
    setSaving(true);
    try {
      await guardarSintesisIA(effectiveMunicipioId!, messages);
      toast.success("Síntesis guardada en Briefings");
    } catch {
      toast.error("Error al guardar la síntesis");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full gap-4">
      <div className="w-72 shrink-0">
        <ContextPanel
          mode={mode}
          kpis={kpis}
          actoresData={actoresData}
          historialData={historialData}
          municipios={municipios}
          selectedIds={selectedMunicipioIds}
          onSelectionChange={setSelectedMunicipioIds}
          onGuardar={handleGuardar}
          canGuardar={canActuallySave}
          saving={saving}
        />
      </div>
      <div className="flex-1 min-w-0">
        <ChatArea
          messages={messages}
          loading={loading}
          onSend={handleSend}
          suggestions={
            mode === "municipal" ? MUNICIPAL_SUGGESTIONS : GLOBAL_SUGGESTIONS
          }
        />
      </div>
    </div>
  );
}
