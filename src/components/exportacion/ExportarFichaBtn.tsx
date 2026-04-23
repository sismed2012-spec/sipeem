"use client";

import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";

type Props = { municipioId: number };

export default function ExportarFichaBtn({ municipioId }: Props) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold gap-2"
      onClick={() => window.open(`/print/municipio/${municipioId}`, "_blank")}
    >
      <FileText className="w-3.5 h-3.5" />
      Exportar PDF
    </Button>
  );
}
