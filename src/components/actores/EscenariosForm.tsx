"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { upsertEscenarios } from "@/actions/actores";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { Escenarios } from "@/lib/types";

type Props = {
  municipioId: number;
  initialData: Escenarios | null;
};

type EscKey = keyof Omit<Escenarios, "id" | "municipio_id">;

const GROUPS: Array<{
  label: string;
  fields: Array<{ key: EscKey; sub: string }>;
}> = [
  { label: "Escenario 1", fields: [{ key: "e1_comp", sub: "A" }, { key: "e1_rec", sub: "B" }] },
  { label: "Escenario 2", fields: [{ key: "e2_gen", sub: "A" }, { key: "e2_atr", sub: "B" }] },
  { label: "Escenario 3", fields: [{ key: "e3_gob", sub: "A" }, { key: "e3_dem", sub: "B" }] },
  { label: "Escenario 4", fields: [{ key: "e4_niv", sub: "A" }, { key: "e4_foco", sub: "B" }] },
];

export default function EscenariosForm({ municipioId, initialData }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const data = {
      e1_comp: (fd.get("e1_comp") as string) ?? "",
      e1_rec: (fd.get("e1_rec") as string) ?? "",
      e2_gen: (fd.get("e2_gen") as string) ?? "",
      e2_atr: (fd.get("e2_atr") as string) ?? "",
      e3_gob: (fd.get("e3_gob") as string) ?? "",
      e3_dem: (fd.get("e3_dem") as string) ?? "",
      e4_niv: (fd.get("e4_niv") as string) ?? "",
      e4_foco: (fd.get("e4_foco") as string) ?? "",
    };

    try {
      await upsertEscenarios(municipioId, data);
      toast.success("Escenarios actualizados");
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
        <CardTitle className="text-xl font-black text-slate-900">Escenarios Políticos</CardTitle>
        <p className="text-sm text-slate-500">
          4 escenarios con 2 campos de análisis cada uno.
        </p>
      </CardHeader>
      <CardContent>
        <form key={JSON.stringify(initialData)} onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {GROUPS.map((group) => (
              <div
                key={group.label}
                className="space-y-3 p-4 rounded-xl border border-slate-100 bg-slate-50/50"
              >
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest">
                  {group.label}
                </p>
                {group.fields.map((field) => (
                  <div key={field.key} className="grid gap-1.5">
                    <Label htmlFor={field.key} className="text-slate-600 text-xs">
                      {field.sub}
                    </Label>
                    <Textarea
                      id={field.key}
                      name={field.key}
                      rows={2}
                      defaultValue={initialData?.[field.key] ?? ""}
                      className="rounded-xl border-slate-200 text-sm resize-none"
                    />
                  </div>
                ))}
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
              {loading ? "Guardando..." : "Guardar escenarios"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
