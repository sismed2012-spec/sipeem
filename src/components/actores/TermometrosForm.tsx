"use client";

import { useEffect, useMemo, useState } from "react";
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

type TermKey = "term1" | "term2" | "term3" | "term4" | "term5";
type TermValues = Record<TermKey, number>;

const EMPTY_VALUES: TermValues = {
  term1: 0,
  term2: 0,
  term3: 0,
  term4: 0,
  term5: 0,
};

const DIMS: Array<{ key: TermKey; label: string }> = [
  { key: "term1", label: "Fortaleza organizacional interna" },
  { key: "term2", label: "Competitividad electoral percibida" },
  { key: "term3", label: "Presencia territorial y cobertura" },
  { key: "term4", label: "Movilización y activismo" },
  { key: "term5", label: "Imagen pública candidato/partido" },
];

function buildValues(initialData: Termometros | null): TermValues {
  if (!initialData) return { ...EMPTY_VALUES };
  return {
    term1: initialData.term1 ?? 0,
    term2: initialData.term2 ?? 0,
    term3: initialData.term3 ?? 0,
    term4: initialData.term4 ?? 0,
    term5: initialData.term5 ?? 0,
  };
}

function clampValue(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function getRangeColorClass(value: number): string {
  if (value <= 39) return "accent-red-500";
  if (value <= 59) return "accent-amber-500";
  if (value <= 79) return "accent-emerald-500";
  return "accent-blue-600";
}

function getRangeBarClass(value: number): string {
  if (value <= 39) return "bg-red-500";
  if (value <= 59) return "bg-amber-500";
  if (value <= 79) return "bg-emerald-500";
  return "bg-blue-600";
}

function getRangeLabel(value: number): string {
  if (value <= 39) return "Rojo · Riesgo crítico";
  if (value <= 59) return "Ámbar · Inestable";
  if (value <= 79) return "Verde · Competitivo";
  return "Fortaleza · Aprovechar ventaja";
}

export default function TermometrosForm({ municipioId, initialData }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<TermValues>(() => buildValues(initialData));

  useEffect(() => {
    setValues(buildValues(initialData));
  }, [initialData]);

  const resumen = useMemo(() => {
    const entries = DIMS.map((dim) => ({
      ...dim,
      value: values[dim.key],
    }));
    const promedio = entries.reduce((acc, item) => acc + item.value, 0) / entries.length;
    const menor = entries.reduce((min, item) => (item.value < min.value ? item : min), entries[0]);
    const mayor = entries.reduce((max, item) => (item.value > max.value ? item : max), entries[0]);
    return { promedio, menor, mayor };
  }, [values]);

  function updateValue(key: TermKey, nextValue: number) {
    setValues((prev) => ({ ...prev, [key]: clampValue(nextValue) }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await upsertTermometros(municipioId, values);
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
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {DIMS.map((dim) => (
              <div key={dim.key} className="grid gap-2 rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor={dim.key}>{dim.label}</Label>
                  <Input
                    id={dim.key}
                    name={dim.key}
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={values[dim.key]}
                    onChange={(e) => updateValue(dim.key, parseFloat(e.target.value))}
                    className="h-8 w-24 rounded-lg border-slate-300 text-right"
                  />
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={values[dim.key]}
                  onChange={(e) => updateValue(dim.key, parseFloat(e.target.value))}
                  className={`w-full cursor-pointer ${getRangeColorClass(values[dim.key])}`}
                  aria-label={`Ajustar ${dim.label}`}
                />
                <div className="space-y-1">
                  <div className="h-2 w-full rounded-full bg-slate-100">
                    <div
                      className={`h-2 rounded-full transition-all ${getRangeBarClass(values[dim.key])}`}
                      style={{ width: `${values[dim.key]}%` }}
                    />
                  </div>
                  <p className="text-xs font-medium text-slate-600">
                    {getRangeLabel(values[dim.key])}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">
              Promedio general: {resumen.promedio.toFixed(1)}
            </p>
            <p className="mt-1">
              Cuello de botella: <span className="font-semibold">{resumen.menor.label}</span> ({resumen.menor.value.toFixed(1)})
            </p>
            <p className="mt-1">
              Fortaleza principal: <span className="font-semibold">{resumen.mayor.label}</span> ({resumen.mayor.value.toFixed(1)})
            </p>
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

        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Lectura rápida por rangos</h3>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              <li>0-39: rojo (riesgo crítico)</li>
              <li>40-59: ámbar (inestable)</li>
              <li>60-79: verde operativo (competitivo)</li>
              <li>80-100: fortaleza (aprovechar ventaja)</li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-900">Regla práctica de decisión</h3>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              <li>Prioridad 1: el termómetro más bajo (cuello de botella).</li>
              <li>Prioridad 2: si hay dos debajo de 50, atacar ambos con plan de 14 días.</li>
              <li>Prioridad 3: proteger el más alto para no perder tracción.</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
