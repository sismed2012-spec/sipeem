"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { upsertCompetencia } from "@/actions/actores";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { CompetenciaMunicipal } from "@/lib/types";

type Props = {
  municipioId: number;
  initialData: CompetenciaMunicipal | null;
};

const RIESGO_COLORS: Record<string, string> = {
  bajo: "text-emerald-600",
  medio: "text-amber-600",
  alto: "text-orange-600",
  critico: "text-rose-600",
};

export default function CompetenciaForm({ municipioId, initialData }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fortaleza, setFortaleza] = useState<string>(initialData?.fortaleza ?? "");
  const [recursos, setRecursos] = useState<string>(initialData?.recursos_estimados ?? "");
  const [riesgo, setRiesgo] = useState<string>(initialData?.riesgo_electoral ?? "");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const data = {
      candidato_nombre: ((fd.get("candidato_nombre") as string | null) ?? "").trim() || null,
      partido: ((fd.get("partido") as string | null) ?? "").trim() || null,
      fortaleza: (fortaleza as CompetenciaMunicipal["fortaleza"]) || null,
      recursos_estimados: (recursos as CompetenciaMunicipal["recursos_estimados"]) || null,
      riesgo_electoral: (riesgo as CompetenciaMunicipal["riesgo_electoral"]) || null,
      ventajas: ((fd.get("ventajas") as string | null) ?? "").trim() || null,
      debilidades: ((fd.get("debilidades") as string | null) ?? "").trim() || null,
      movimientos_recientes: ((fd.get("movimientos_recientes") as string | null) ?? "").trim() || null,
    };

    try {
      await upsertCompetencia(municipioId, data);
      toast.success("Análisis de competencia guardado");
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
        <CardTitle className="text-xl font-black text-slate-900">Análisis de Competencia</CardTitle>
        <p className="text-sm text-slate-500">Datos del adversario principal en este municipio.</p>
      </CardHeader>
      <CardContent>
        <form key={JSON.stringify(initialData)} onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="candidato_nombre">Candidato adversario</Label>
              <Input
                id="candidato_nombre"
                name="candidato_nombre"
                defaultValue={initialData?.candidato_nombre ?? ""}
                placeholder="Nombre completo"
                className="rounded-xl border-slate-200"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="partido">Partido</Label>
              <Input
                id="partido"
                name="partido"
                defaultValue={initialData?.partido ?? ""}
                placeholder="Nombre o siglas del partido"
                className="rounded-xl border-slate-200"
              />
            </div>

            <div className="grid gap-2">
              <Label>Fortaleza percibida</Label>
              <Select value={fortaleza} onValueChange={(v) => setFortaleza(v ?? "")}>
                <SelectTrigger className="rounded-xl border-slate-200"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="debil">Débil</SelectItem>
                  <SelectItem value="media">Media</SelectItem>
                  <SelectItem value="fuerte">Fuerte</SelectItem>
                  <SelectItem value="muy_fuerte">Muy fuerte</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Recursos estimados</Label>
              <Select value={recursos} onValueChange={(v) => setRecursos(v ?? "")}>
                <SelectTrigger className="rounded-xl border-slate-200"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bajos">Bajos</SelectItem>
                  <SelectItem value="medios">Medios</SelectItem>
                  <SelectItem value="altos">Altos</SelectItem>
                  <SelectItem value="muy_altos">Muy altos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2 md:col-span-2">
              <Label className={RIESGO_COLORS[riesgo] || "text-slate-700"}>
                Riesgo electoral {riesgo && <span className="font-black uppercase text-[10px] tracking-widest">({riesgo})</span>}
              </Label>
              <Select value={riesgo} onValueChange={(v) => setRiesgo(v ?? "")}>
                <SelectTrigger className="rounded-xl border-slate-200"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bajo">Bajo</SelectItem>
                  <SelectItem value="medio">Medio</SelectItem>
                  <SelectItem value="alto">Alto</SelectItem>
                  <SelectItem value="critico">Crítico</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ventajas">Ventajas del adversario</Label>
              <Textarea
                id="ventajas"
                name="ventajas"
                defaultValue={initialData?.ventajas ?? ""}
                rows={3}
                placeholder="Principales fortalezas identificadas..."
                className="rounded-xl border-slate-200 resize-none text-sm"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="debilidades">Debilidades identificadas</Label>
              <Textarea
                id="debilidades"
                name="debilidades"
                defaultValue={initialData?.debilidades ?? ""}
                rows={3}
                placeholder="Puntos vulnerables del adversario..."
                className="rounded-xl border-slate-200 resize-none text-sm"
              />
            </div>

            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="movimientos_recientes">Movimientos recientes</Label>
              <Textarea
                id="movimientos_recientes"
                name="movimientos_recientes"
                defaultValue={initialData?.movimientos_recientes ?? ""}
                rows={3}
                placeholder="Últimas acciones, eventos o declaraciones observadas..."
                className="rounded-xl border-slate-200 resize-none text-sm"
              />
            </div>
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
              {loading ? "Guardando..." : "Guardar análisis"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
