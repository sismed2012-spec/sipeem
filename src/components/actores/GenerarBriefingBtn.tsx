"use client";

import { useState } from "react";
import { generarBriefing } from "@/actions/briefings";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Props = { municipioId: number };

export default function GenerarBriefingBtn({ municipioId }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleGenerar() {
    setLoading(true);
    try {
      const briefingId = await generarBriefing(municipioId);
      toast.success("Briefing generado — abriendo en nueva pestaña");
      window.open(`/print/briefing/${briefingId}`, "_blank");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al generar briefing");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      onClick={handleGenerar}
      disabled={loading}
      className="rounded-xl bg-indigo-600 hover:bg-indigo-700 font-bold gap-2"
    >
      {loading ? (
        <><Loader2 className="w-4 h-4 animate-spin" /> Generando con IA...</>
      ) : (
        <><Sparkles className="w-4 h-4" /> Generar Briefing</>
      )}
    </Button>
  );
}
