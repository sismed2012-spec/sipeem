"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { upsertComite } from "@/actions/actores";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { ComiteMunicipal } from "@/lib/types";

type Props = {
  municipioId: number;
  initialData: ComiteMunicipal | null;
};

export default function ComiteForm({ municipioId, initialData }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const data = {
      presidente: ((fd.get("presidente") as string | null) ?? "").trim(),
      secretario: ((fd.get("secretario") as string | null) ?? "").trim(),
      fachada_url: ((fd.get("fachada_url") as string | null) ?? "").trim() || null,
      link_maps: ((fd.get("link_maps") as string | null) ?? "").trim() || null,
      inaugurado: fd.get("inaugurado") === "on",
    };

    try {
      await upsertComite(municipioId, data);
      toast.success("Comité municipal actualizado");
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
        <CardTitle className="text-xl font-black text-slate-900">Comité Municipal</CardTitle>
        <p className="text-sm text-slate-500">Datos del comité municipal del partido.</p>
      </CardHeader>
      <CardContent>
        <form key={JSON.stringify(initialData)} onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="presidente">Presidente</Label>
              <Input
                id="presidente"
                name="presidente"
                required
                defaultValue={initialData?.presidente ?? ""}
                placeholder="Nombre completo"
                className="rounded-xl border-slate-200"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="secretario">Secretario</Label>
              <Input
                id="secretario"
                name="secretario"
                required
                defaultValue={initialData?.secretario ?? ""}
                placeholder="Nombre completo"
                className="rounded-xl border-slate-200"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="fachada_url">URL Fachada (opcional)</Label>
              <Input
                id="fachada_url"
                name="fachada_url"
                type="url"
                defaultValue={initialData?.fachada_url ?? ""}
                placeholder="https://..."
                className="rounded-xl border-slate-200"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="link_maps">Google Maps (opcional)</Label>
              <Input
                id="link_maps"
                name="link_maps"
                type="url"
                defaultValue={initialData?.link_maps ?? ""}
                placeholder="https://maps.google.com/..."
                className="rounded-xl border-slate-200"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              id="inaugurado"
              name="inaugurado"
              type="checkbox"
              defaultChecked={initialData?.inaugurado ?? false}
              className="h-4 w-4 rounded border-slate-300 accent-slate-900"
            />
            <Label htmlFor="inaugurado" className="font-medium text-slate-700 cursor-pointer">
              Comité inaugurado
            </Label>
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
              {loading ? "Guardando..." : "Guardar comité"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
