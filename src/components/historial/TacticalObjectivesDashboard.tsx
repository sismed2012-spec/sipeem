"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition, useState, useEffect } from "react";
import { updateSeccionObjetivoStatus } from "@/actions/secciones-objetivo";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/analytics/StatCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Activity, AlertOctagon, AlertTriangle, ArrowRight, Map as MapIcon } from "lucide-react";

type Props = {
  tacticalObjectives: {
    filters: {
      priority: string | null;
      status: string | null;
      municipioId: number | null;
      year: number | null;
    };
    filterOptions: {
      priorities: string[];
      statuses: string[];
      years: number[];
      municipios: { id: number; nombre: string }[];
    };
    counts: {
      total: number;
      criticas: number;
      altas: number;
      municipios: number;
      pendientes: number;
      atendidas: number;
    };
    topMunicipios: {
      municipioId: number;
      nombre: string;
      total: number;
      criticas: number;
    }[];
    topSecciones: {
      id: number;
      municipioId: number;
      municipio: string;
      seccionNumero: number | null;
      prioridad: string;
      estatus: string;
      score: number | null;
      anio: number | null;
    }[];
  };
};

const STATUS_OPTIONS = ["Pendiente", "En seguimiento", "Atendida", "Descartada"] as const;

function priorityBadgeClass(prioridad: string) {
  if (prioridad === "Critica") return "bg-rose-50 text-rose-700 border-none";
  if (prioridad === "Alta") return "bg-amber-50 text-amber-700 border-none";
  if (prioridad === "Media") return "bg-blue-50 text-blue-700 border-none";
  return "bg-emerald-50 text-emerald-700 border-none";
}

function statusBadgeClass(estatus: string) {
  if (estatus === "Pendiente") return "bg-slate-100 text-slate-700 border-none";
  if (estatus === "En seguimiento") return "bg-blue-50 text-blue-700 border-none";
  if (estatus === "Atendida") return "bg-emerald-50 text-emerald-700 border-none";
  return "bg-slate-200 text-slate-700 border-none";
}

export default function TacticalObjectivesDashboard({ tacticalObjectives }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [selectedPriority, setSelectedPriority] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [selectedMunicipio, setSelectedMunicipio] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<string>("");

  useEffect(() => {
    setSelectedPriority(tacticalObjectives.filters.priority || "");
    setSelectedStatus(tacticalObjectives.filters.status || "");
    setSelectedMunicipio(tacticalObjectives.filters.municipioId?.toString() || "");
    setSelectedYear(tacticalObjectives.filters.year?.toString() || "");
  }, [tacticalObjectives.filters]);

  function pushFilter(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams);
    if (!value || value === "") params.delete(key);
    else params.set(key, value);
    startTransition(() => {
      router.push(`/admin/historial/dashboard?${params.toString()}`);
    });
  }

  function clearFilters() {
    setSelectedPriority("");
    setSelectedStatus("");
    setSelectedMunicipio("");
    setSelectedYear("");
    startTransition(() => {
      router.push("/admin/historial/dashboard");
    });
  }

  function updateStatus(
    objetivoId: number,
    municipioId: number,
    estatus: string | null
  ) {
    if (!estatus) return;
    startTransition(async () => {
      await updateSeccionObjetivoStatus({
        objetivoId,
        municipioId,
        estatus: estatus as "Pendiente" | "En seguimiento" | "Atendida" | "Descartada",
      });
      router.refresh();
    });
  }

  const hasFilters =
    tacticalObjectives.filters.priority ||
    tacticalObjectives.filters.status ||
    tacticalObjectives.filters.municipioId ||
    tacticalObjectives.filters.year;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.25em]">
          Objetivos Tácticos
        </h2>
        <p className="mt-1 text-sm font-medium text-slate-500">
          Concentrado estatal de secciones guardadas para seguimiento operativo.
        </p>
      </div>

      <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/50 p-4 shadow-inner md:grid-cols-4">
        <Select
          value={selectedPriority}
          onValueChange={(value) => {
            setSelectedPriority(value || "");
            pushFilter("priority", value || null);
          }}
        >
          <SelectTrigger className="w-full rounded-xl border-slate-200 bg-white h-11">
            <SelectValue placeholder="Prioridad">
              {selectedPriority || "Prioridad"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="">Todas las prioridades</SelectItem>
            {tacticalObjectives.filterOptions.priorities.map((priority) => (
              <SelectItem key={priority} value={priority}>
                {priority}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={selectedStatus}
          onValueChange={(value) => {
            setSelectedStatus(value || "");
            pushFilter("status", value || null);
          }}
        >
          <SelectTrigger className="w-full rounded-xl border-slate-200 bg-white h-11">
            <SelectValue placeholder="Estatus">
              {selectedStatus || "Estatus"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="">Todos los estatus</SelectItem>
            {tacticalObjectives.filterOptions.statuses.map((status) => (
              <SelectItem key={status} value={status}>
                {status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={selectedMunicipio}
          onValueChange={(value) => {
            setSelectedMunicipio(value || "");
            pushFilter("municipioId", value || null);
          }}
        >
          <SelectTrigger className="w-full rounded-xl border-slate-200 bg-white h-11">
            <SelectValue placeholder="Municipio">
              {selectedMunicipio
                ? tacticalObjectives.filterOptions.municipios.find(
                    (m) => m.id.toString() === selectedMunicipio
                  )?.nombre
                : "Municipio"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="">Todos los municipios</SelectItem>
            {tacticalObjectives.filterOptions.municipios.map((municipio) => (
              <SelectItem key={municipio.id} value={municipio.id.toString()}>
                {municipio.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={selectedYear}
          onValueChange={(value) => {
            setSelectedYear(value || "");
            pushFilter("year", value || null);
          }}
        >
          <SelectTrigger className="w-full rounded-xl border-slate-200 bg-white h-11">
            <SelectValue placeholder="Año">
              {selectedYear || "Año"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="">Todos los años</SelectItem>
            {tacticalObjectives.filterOptions.years.map((year) => (
              <SelectItem key={year} value={year.toString()}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <div className="md:col-span-4 flex justify-end">
            <button
              onClick={clearFilters}
              className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 transition-colors hover:text-slate-900"
            >
              Limpiar filtros
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <StatCard
          title="Objetivos Guardados"
          value={tacticalObjectives.counts.total}
          sub="Secciones persistidas"
          icon={AlertTriangle}
          colorClass="text-slate-900"
        />
        <StatCard
          title="Críticas"
          value={tacticalObjectives.counts.criticas}
          sub="Máxima urgencia"
          icon={AlertOctagon}
          colorClass="text-rose-600"
        />
        <StatCard
          title="Altas"
          value={tacticalObjectives.counts.altas}
          sub="Seguimiento cercano"
          icon={Activity}
          colorClass="text-amber-600"
        />
        <StatCard
          title="Pendientes"
          value={tacticalObjectives.counts.pendientes}
          sub="Sin atender"
          icon={AlertTriangle}
          colorClass="text-slate-700"
        />
        <StatCard
          title="Atendidas"
          value={tacticalObjectives.counts.atendidas}
          sub="Con seguimiento cerrado"
          icon={Activity}
          colorClass="text-emerald-600"
        />
        <StatCard
          title="Municipios Activos"
          value={tacticalObjectives.counts.municipios}
          sub="Con objetivos registrados"
          icon={MapIcon}
          colorClass="text-blue-600"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-slate-200 shadow-lg rounded-2xl overflow-hidden bg-white">
          <CardHeader className="p-6 border-b border-slate-100">
            <CardTitle className="text-lg font-black uppercase tracking-tight">Municipios con Más Objetivos</CardTitle>
            <CardDescription className="text-xs font-bold uppercase tracking-widest text-slate-400">Carga táctica acumulada por municipio</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow>
                  <TableHead className="font-black text-[10px] uppercase tracking-widest p-4">Municipio</TableHead>
                  <TableHead className="font-black text-[10px] uppercase tracking-widest p-4 text-right">Objetivos</TableHead>
                  <TableHead className="p-4"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tacticalObjectives.topMunicipios.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center p-8 text-slate-400 italic text-xs">Sin objetivos tácticos guardados</TableCell></TableRow>
                ) : (
                  tacticalObjectives.topMunicipios.map((row) => (
                    <TableRow key={row.municipioId} className="hover:bg-slate-50/50 transition-colors group">
                      <TableCell className="p-4">
                        <div className="font-black text-slate-900 uppercase tracking-tighter">{row.nombre}</div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase">{row.criticas} críticas</div>
                      </TableCell>
                      <TableCell className="p-4 text-right">
                        <div className="font-black text-slate-900">{row.total}</div>
                      </TableCell>
                      <TableCell className="p-4 text-right">
                        <Link href={`/admin/historial/municipio/${row.municipioId}`}>
                          <ArrowRight className="h-4 w-4 ml-auto text-slate-300 group-hover:text-slate-900 transition-colors" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-lg rounded-2xl overflow-hidden bg-white">
          <CardHeader className="p-6 border-b border-slate-100">
            <CardTitle className="text-lg font-black uppercase tracking-tight">Secciones Priorizadas</CardTitle>
            <CardDescription className="text-xs font-bold uppercase tracking-widest text-slate-400">Seguimiento por prioridad y estatus</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow>
                  <TableHead className="font-black text-[10px] uppercase tracking-widest p-4">Sección</TableHead>
                  <TableHead className="font-black text-[10px] uppercase tracking-widest p-4 text-right">Score</TableHead>
                  <TableHead className="font-black text-[10px] uppercase tracking-widest p-4">Estatus</TableHead>
                  <TableHead className="p-4"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tacticalObjectives.topSecciones.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center p-8 text-slate-400 italic text-xs">Sin objetivos tácticos guardados</TableCell></TableRow>
                ) : (
                  tacticalObjectives.topSecciones.map((row) => (
                    <TableRow key={row.id} className="hover:bg-slate-50/50 transition-colors group">
                      <TableCell className="p-4">
                        <div className="font-black text-slate-900 uppercase tracking-tighter">
                          {row.municipio}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <Badge className="bg-slate-100 text-slate-700 border-none">
                            Sección {row.seccionNumero ?? "N/D"}
                          </Badge>
                          <Badge className={priorityBadgeClass(row.prioridad)}>
                            {row.prioridad}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="p-4 text-right">
                        <div className="font-black text-slate-900">{row.score ?? "N/D"}</div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase">{row.anio ?? "S/A"}</div>
                      </TableCell>
                      <TableCell className="p-4">
                        <div className="space-y-2">
                          <Badge className={statusBadgeClass(row.estatus)}>{row.estatus}</Badge>
                          <Select
                            value={row.estatus}
                            onValueChange={(value) => updateStatus(row.id, row.municipioId, value)}
                            disabled={isPending}
                          >
                            <SelectTrigger className="h-8 rounded-xl border-slate-200 bg-white text-xs font-semibold">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              {STATUS_OPTIONS.map((status) => (
                                <SelectItem key={status} value={status}>
                                  {status}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </TableCell>
                      <TableCell className="p-4 text-right">
                        <Link href={`/admin/historial/municipio/${row.municipioId}`}>
                          <ArrowRight className="h-4 w-4 ml-auto text-slate-300 group-hover:text-slate-900 transition-colors" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
