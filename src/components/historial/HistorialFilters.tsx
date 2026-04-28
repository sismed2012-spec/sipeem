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

  const [selectedMunicipio, setSelectedMunicipio] = useState<string>("");
  const [selectedAnio, setSelectedAnio] = useState<string>("");
  const [selectedGanador, setSelectedGanador] = useState<string>("");

  useEffect(() => {
    setSelectedMunicipio(currentParams.municipioId || "");
    setSelectedAnio(currentParams.anio || "");
    setSelectedGanador(currentParams.partidoId || "");
  }, [currentParams.municipioId, currentParams.anio, currentParams.partidoId]);

  function pushParams(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    params.delete("page");

    if (value && value !== "" && value !== "all") {
      params.set(key, value);
    } else {
      params.delete(key);
    }

    startTransition(() => {
      router.push(`/admin/historial?${params.toString()}`);
    });
  }

  useEffect(() => {
    function pushSearchQuery(value: string) {
      const params = new URLSearchParams(searchParams);
      params.delete("page");

      if (value) {
        params.set("q", value);
      } else {
        params.delete("q");
      }

      startTransition(() => {
        router.push(`/admin/historial?${params.toString()}`);
      });
    }

    const delayDebounceFn = setTimeout(() => {
      if (searchValue !== (currentParams.q || "")) {
        pushSearchQuery(searchValue);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [searchValue, currentParams.q, router, searchParams, startTransition]);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 40 }, (_, i) => currentYear - i);

  function clearFilters() {
    setSearchValue("");
    setSelectedMunicipio("");
    setSelectedAnio("");
    setSelectedGanador("");
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
          value={selectedMunicipio}
          onValueChange={(val) => {
            setSelectedMunicipio(val || "");
            if (val) {
              pushParams("municipioId", val);
            } else {
              pushParams("municipioId", "");
            }
          }}
        >
          <SelectTrigger className="w-full rounded-xl border-slate-200 bg-white h-11">
            <SelectValue placeholder="Municipio">
              {selectedMunicipio && selectedMunicipio !== "all"
                ? municipios.find((m) => m.id.toString() === selectedMunicipio)?.nombre
                : "Municipio"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="">Todos los municipios</SelectItem>
            {municipios.map((m) => (
              <SelectItem key={m.id} value={m.id.toString()}>
                {m.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={selectedAnio}
          onValueChange={(val) => {
            setSelectedAnio(val || "");
            if (val) {
              pushParams("anio", val);
            } else {
              pushParams("anio", "");
            }
          }}
        >
          <SelectTrigger className="w-full rounded-xl border-slate-200 bg-white h-11">
            <SelectValue placeholder="Año">
              {selectedAnio && selectedAnio !== "all" ? selectedAnio : "Año"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="rounded-xl shadow-2xl">
            <SelectItem value="">Todos los años</SelectItem>
            {years.map((y) => (
              <SelectItem key={y} value={y.toString()}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={selectedGanador}
          onValueChange={(val) => {
            setSelectedGanador(val || "");
            if (val) {
              pushParams("partidoId", val);
            } else {
              pushParams("partidoId", "");
            }
          }}
        >
          <SelectTrigger className="w-full rounded-xl border-slate-200 bg-white h-11 px-3 truncate">
            <SelectValue placeholder="Ganador">
              {selectedGanador && selectedGanador !== "all"
                ? partidos.find((p) => p.id.toString() === selectedGanador)?.nombre
                : "Ganador"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="">Todos los ganadores</SelectItem>
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
