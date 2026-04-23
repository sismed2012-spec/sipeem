"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { upsertTermometros } from "@/actions/actores";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Termometros } from "@/lib/types";

type Props = {
  municipioId: number;
  initialData: Termometros | null;
};

type TermKey = keyof Omit<Termometros, "id" | "municipio_id">;

const DIMS: Array<{ key: TermKey; label: string }> = [
  { key: "term1", label: "T1" },
  { key: "term2", label: "T2" },
  { key: "term3", label: "T3" },
  { key: "term4", label: "T4" },
  { key: "term5", label: "T5" },
];

export default function TermometrosForm({ municipioId, initialData }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    function safeNum(v: FormDataEntryValue | null): number {
      const n = parseFloat((v as string) || "0");
      return isNaN(n) ? 0 : n;
    }
    const data = {
      term1: safeNum(fd.get("term1")),
      term2: safeNum(fd.get("term2")),
      term3: safeNum(fd.get("term3")),
      term4: safeNum(fd.get("term4")),
      term5: safeNum(fd.get("term5")),
    };

    try {
      await upsertTermometros(municipioId, data);
      toast.success("Termómetros actualizados");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-slate-200 shadow-md">
      <CardHeader>
        <CardTitle className="text-xl font-black text-slate-900">Termómetros Políticos</CardTitle>
        <p className="text-sm text-slate-500">
          Mediciones de las 5 dimensiones de análisis (0–100).
        </p>
      </CardHeader>
      <CardContent>
        <form key={JSON.stringify(initialData)} onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-5">
            {DIMS.map((dim) => (
              <div key={dim.key} className="grid gap-2">
                <Label htmlFor={dim.key}>{dim.label}</Label>
                <Input
                  id={dim.key}
                  name={dim.key}
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  defaultValue={initialData?.[dim.key] ?? 0}
                  className="rounded-xl border-slate-200"
                />
              </div>
            ))}
          </div>

          {error && (
            <div role="alert" className="p-4 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm font-medium">
              Error: {error}
            </div>
          )}

          <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
            <Button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-slate-900 font-bold hover:bg-slate-800"
            >
              {loading ? "Guardando..." : "Guardar termómetros"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
