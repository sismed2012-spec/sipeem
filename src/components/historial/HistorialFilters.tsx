"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Municipio, Partido } from "@/lib/types";
import { useTransition, useEffect, useState } from "react";
import { X } from "lucide-react";

type FiltersProps = {
  municipios: Municipio[];
  partidos: Partido[];
  currentParams: {
    q?: string;
    municipioId?: string;
    anio?: string;
    partidoId?: string;
  };
};

export default function HistorialFilters({
  municipios,
  partidos,
  currentParams,
}: FiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(currentParams.q || "");

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchValue !== (currentParams.q || "")) {
        updateParams("q", searchValue);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [searchValue, currentParams.q]);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 40 }, (_, i) => currentYear - i);

  function updateParams(key: string, value: string) {
    const params = new URLSearchParams(searchParams);

    if (value && value !== "all") {
      params.set(key, value);
    } else {
      params.delete(key);
    }

    startTransition(() => {
      router.push(`/admin/historial?${params.toString()}`);
    });
  }

  function clearFilters() {
    setSearchValue("");
    startTransition(() => {
      router.push("/admin/historial");
    });
  }

  const hasFilters =
    currentParams.q ||
    currentParams.municipioId ||
    currentParams.anio ||
    currentParams.partidoId;

  return (
    <div className="flex flex-col gap-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-200 shadow-inner">
      <div className="grid gap-4 md:grid-cols-4 items-center">
        <div className="relative group">
          <Input
            value={searchValue}
            placeholder="Buscar municipio o partido..."
            onChange={(e) => setSearchValue(e.target.value)}
            className={`rounded-xl border-slate-200 bg-white transition-all focus:ring-2 focus:ring-slate-900/5 ${isPending ? "opacity-50" : ""
              }`}
          />
          {isPending && (
            <div className="absolute right-3 top-3 h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
          )}
        </div>

        <Select
          defaultValue={currentParams.municipioId || "all"}
          onValueChange={(val) => updateParams("municipioId", val ?? "all")}
        >
          <SelectTrigger className="rounded-xl border-slate-200 bg-white">
            <SelectValue placeholder="Municipio" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="all">Filtro: Municipio</SelectItem>
            {municipios.map((m) => (
              <SelectItem key={m.id} value={m.id.toString()}>
                {m.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          defaultValue={currentParams.anio || "all"}
          onValueChange={(val) => updateParams("anio", val ?? "all")}
        >
          <SelectTrigger className="rounded-xl border-slate-200 bg-white">
            <SelectValue placeholder="Año" />
          </SelectTrigger>
          <SelectContent className="rounded-xl shadow-2xl">
            <SelectItem value="all">Filtro: Año</SelectItem>
            {years.map((y) => (
              <SelectItem key={y} value={y.toString()}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          defaultValue={currentParams.partidoId || "all"}
          onValueChange={(val) => updateParams("partidoId", val ?? "all")}
        >
          <SelectTrigger className="rounded-xl border-slate-200 bg-white">
            <SelectValue placeholder="Fuerza ganadora" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="all">Filtro: Ganador</SelectItem>
            {partidos.map((p) => (
              <SelectItem key={p.id} value={p.id.toString()}>
                <div className="flex items-center gap-2">
                  <div
                    className="h-2 w-2 rounded-full border border-slate-200"
                    style={{ backgroundColor: p.color }}
                  />
                  <span>{p.siglas}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {hasFilters && (
        <div className="flex justify-end pr-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-red-500 transition-colors"
          >
            <X className="h-3 w-3 mr-1" /> Limpiar filtros
          </Button>
        </div>
      )}
    </div>
  );
}