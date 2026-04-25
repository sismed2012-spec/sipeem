"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Bot, User } from "lucide-react";
import type { Message } from "@/lib/inteligencia-types";

interface Props {
  messages: Message[];
  loading: boolean;
  onSend: (content: string) => void;
  suggestions?: string[];
}

export default function ChatArea({
  messages,
  loading,
  onSend,
  suggestions,
}: Props) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    onSend(input.trim());
    setInput("");
  }

  return (
    <div className="flex flex-col h-[500px]">
      <div className="flex-1 overflow-y-auto space-y-3 pr-2 mb-4">
        {messages.length === 0 && (
          <div className="text-center py-12 space-y-2">
            <Bot className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm text-slate-400">
              Pregunta sobre la estrategia, riesgos, aspirantes o cualquier
              aspecto de este municipio.
            </p>
            {suggestions && suggestions.length > 0 && (
              <div className="flex flex-wrap gap-2 justify-center mt-4">
                {suggestions.map((sugg) => (
                  <button
                    key={sugg}
                    onClick={() => setInput(sugg)}
                    className="text-xs px-3 py-1.5 rounded-full border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition-colors"
                  >
                    {sugg}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-2 ${
              msg.role === "user" ? "justify-end" : "justify-start"
            }`}
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
              {msg.content ||
                (loading && i === messages.length - 1 ? "▋" : "")}
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

      <form onSubmit={handleSubmit} className="flex gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
          placeholder="Pregunta... (Enter para enviar)"
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
