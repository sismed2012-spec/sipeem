"use client";

import { useState } from "react";
import {
  PrioridadEstrategica,
  RiesgoPolitico,
  OportunidadPolitica,
  EstatusEstrategia,
  EstrategiaMunicipal,
} from "@/lib/types";
import { upsertMunicipioStrategicFile } from "@/actions/estrategia";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Shield,
  Target,
  Flag,
  Save,
  Loader2,
  Info,
  User,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  municipioId: number;
  initialData: EstrategiaMunicipal | null;
}

export function StrategicForm({ municipioId, initialData }: Props) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<Partial<EstrategiaMunicipal>>(
    initialData || {
      municipio_id: municipioId,
      prioridad: "Media",
      riesgo: "Medio",
      oportunidad: "Baja",
      estatus: "Planeación",
      notas_ejecutivas: "",
      notas_operativas: "",
      responsable: "",
    }
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await upsertMunicipioStrategicFile({
        ...formData,
        municipio_id: municipioId,
      });
      toast.success("Valoración estratégica actualizada");
    } catch (error: unknown) {
      console.error(error);
      toast.error(
        "Error al guardar: " +
          (error instanceof Error ? error.message : "Error desconocido")
      );
    } finally {
      setLoading(false);
    }
  };

  const updateField = <T extends keyof EstrategiaMunicipal>(
    field: T,
    value: EstrategiaMunicipal[T]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card className="border-slate-200 shadow-xl overflow-hidden rounded-3xl">
        <CardHeader className="bg-slate-900 text-white p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/10 rounded-xl">
                <Target className="w-5 h-5 text-indigo-300" />
              </div>
              <div>
                <CardTitle className="text-lg font-black tracking-tight">
                  Evaluación Estratégica
                </CardTitle>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">
                  Valoración Cualitativa Directiva
                </p>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="bg-indigo-500 hover:bg-indigo-600 font-black uppercase text-[10px] tracking-widest px-6"
            >
              {loading ? (
                <Loader2 className="w-3 h-3 animate-spin mr-2" />
              ) : (
                <Save className="w-3 h-3 mr-2" />
              )}
              Guardar Ficha
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-8 space-y-8">
          <div className="grid gap-6 md:grid-cols-3">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Flag className="w-3 h-3 text-indigo-500" /> Prioridad Estratégica
              </label>
              <Select
                value={formData.prioridad}
                onValueChange={(v) => updateField("prioridad", v as PrioridadEstrategica)}
              >
                <SelectTrigger
                  className={cn(
                    "h-12 font-bold transition-all border-2",
                    formData.prioridad === "Crítica"
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : formData.prioridad === "Alta"
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-slate-100 bg-slate-50 text-slate-700"
                  )}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200">
                  <SelectItem value="Baja" className="font-bold">Baja</SelectItem>
                  <SelectItem value="Media" className="font-bold">Media</SelectItem>
                  <SelectItem value="Alta" className="font-bold text-amber-600">Alta</SelectItem>
                  <SelectItem value="Crítica" className="font-bold text-rose-600">Crítica</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Shield className="w-3 h-3 text-rose-500" /> Riesgo Político
              </label>
              <Select
                value={formData.riesgo}
                onValueChange={(v) => updateField("riesgo", v as RiesgoPolitico)}
              >
                <SelectTrigger
                  className={cn(
                    "h-12 font-bold transition-all border-2",
                    formData.riesgo === "Extremo"
                      ? "border-rose-600/20 bg-rose-50 text-rose-700"
                      : formData.riesgo === "Alto"
                        ? "border-amber-600/20 bg-amber-50 text-amber-700"
                        : "border-slate-100 bg-slate-50 text-slate-700"
                  )}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200">
                  <SelectItem value="Bajo" className="font-bold">Bajo</SelectItem>
                  <SelectItem value="Medio" className="font-bold">Medio</SelectItem>
                  <SelectItem value="Alto" className="font-bold text-amber-600">Alto</SelectItem>
                  <SelectItem value="Extremo" className="font-bold text-rose-600 underline">Extremo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <TrendingUp className="w-3 h-3 text-emerald-500" /> Oportunidad
              </label>
              <Select
                value={formData.oportunidad}
                onValueChange={(v) => updateField("oportunidad", v as OportunidadPolitica)}
              >
                <SelectTrigger className="h-12 font-bold border-2 border-slate-100 bg-slate-50 text-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200">
                  <SelectItem value="Baja" className="font-bold">Baja</SelectItem>
                  <SelectItem value="Media" className="font-bold">Media</SelectItem>
                  <SelectItem value="Alta" className="font-bold text-emerald-600">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                <Info className="w-3 h-3 text-indigo-500" /> Estatus Operativo
              </label>
              <Select
                value={formData.estatus}
                onValueChange={(v) => updateField("estatus", v as EstatusEstrategia)}
              >
                <SelectTrigger className="h-12 font-bold border-2 bg-slate-900 text-white rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200">
                  <SelectItem value="Planeación" className="font-bold">Planeación</SelectItem>
                  <SelectItem value="En Proceso" className="font-bold">En Proceso</SelectItem>
                  <SelectItem value="Ejecutado" className="font-bold">Ejecutado</SelectItem>
                  <SelectItem value="Monitoreo" className="font-bold">Monitoreo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                <User className="w-3 h-3 text-indigo-500" /> Responsable Directo
              </label>
              <Input
                className="h-12 border-2 border-slate-100 bg-slate-50 font-bold focus:ring-indigo-500"
                placeholder="Nombre del responsable"
                value={formData.responsable || ""}
                onChange={(e) => updateField("responsable", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-6 pt-4 border-t border-slate-100">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Apreciación Ejecutiva (Resumen)
              </label>
              <Textarea
                className="min-h-[100px] border-2 border-slate-100 bg-slate-50 font-medium text-slate-800 focus:ring-indigo-500 p-4 rounded-2xl"
                placeholder="Síntesis de la situación política actual del municipio..."
                value={formData.notas_ejecutivas || ""}
                onChange={(e) => updateField("notas_ejecutivas", e.target.value)}
              />
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Hoja de Ruta / Notas Operativas
              </label>
              <Textarea
                className="min-h-[150px] border-2 border-slate-100 bg-slate-50 font-medium text-slate-800 focus:ring-indigo-500 p-4 rounded-2xl"
                placeholder="Acciones concretas, alianzas o focos de atención operativa..."
                value={formData.notas_operativas || ""}
                onChange={(e) => updateField("notas_operativas", e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
