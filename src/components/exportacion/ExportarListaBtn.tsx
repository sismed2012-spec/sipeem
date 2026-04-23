"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { exportMunicipiosExcel } from "@/actions/exportacion";
import { Download } from "lucide-react";
import { toast } from "sonner";

export default function ExportarListaBtn() {
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      const base64 = await exportMunicipiosExcel();
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sipeem-municipios-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Archivo descargado");
    } catch {
      toast.error("Error al exportar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={loading}
      className="rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold gap-2"
    >
      <Download className="w-3.5 h-3.5" />
      {loading ? "Exportando..." : "Exportar Excel"}
    </Button>
  );
}
