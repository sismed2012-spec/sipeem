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
              // skip malformed lines
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
          <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot className="w-3.5 h-3.5 text-indigo-600" />
              </div>
            )}
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
              msg.role === "user"
                ? "bg-slate-900 text-white rounded-tr-sm"
                : "bg-slate-100 text-slate-800 rounded-tl-sm"
            }`}>
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
