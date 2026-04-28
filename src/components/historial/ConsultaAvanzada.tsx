"use client";

import { useTransition, useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getPivotData,
  type PivotConfig,
  type PivotResult,
  type PivotRowDim,
  type PivotColDim,
  type PivotMetric,
  type ElectionType,
  type ConsultaInitialData,
} from "@/actions/historial-consulta";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertCircle,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  Search,
  TableIcon,
  X,
} from "lucide-react";

const ROW_DIM_VALUES: PivotRowDim[] = ["municipio", "distrito", "region", "seccion"];
const COL_DIM_VALUES: PivotColDim[] = ["anio", "fuerza"];
const ELECTION_TYPE_VALUES: ElectionType[] = ["municipal", "seccional", "gubernatura", "gubernatura_municipal"];
const METRIC_VALUES: PivotMetric[] = [
  "votos_validos",
  "lista_nominal",
  "participacion",
  "ganador",
  "votos_ganador",
  "porcentaje_ganador",
  "margen_votos",
  "margen_porcentual",
  "votos_fuerza",
];

function parseCsvParam(param: string | null): string[] {
  if (!param) return [];
  return param.split(",").map(v => v.trim()).filter(Boolean);
}

// ─────────────────────────────────────────────
// Party color map (for cell badges)
// ─────────────────────────────────────────────

const PARTY_COLORS: Record<string, string> = {
  PAN: "#1d4ed8", PRI: "#dc2626", PRD: "#ca8a04", PVEM: "#16a34a",
  PT: "#ef4444", MC: "#f97316", MORENA: "#7f1d1d", NAEM: "#0f766e",
  PAN_PRI: "#1e3a8a", PAN_PRD: "#1e293b", PAN_NAEM: "#155e75",
  PRI_PRD: "#991b1b", PRI_NAEM: "#7c2d12", PRD_NAEM: "#a16207",
  PVEM_PT_MORENA: "#166534", PVEM_PT: "#15803d", PVEM_MORENA: "#166534",
  PT_MORENA: "#991b1b", PAN_PRI_PRD: "#64748b", PAN_PRI_PRD_NAEM: "#475569",
};

function getPartyColor(siglas: string | null): string {
  if (!siglas) return "#94a3b8";
  return PARTY_COLORS[siglas] ?? "#6b7280";
}

// ─────────────────────────────────────────────
// Available metrics by context
// ─────────────────────────────────────────────

type MetricOption = { value: PivotMetric; label: string };

function getAvailableMetrics(colDim: PivotColDim, electionType: ElectionType): MetricOption[] {
  if (colDim === "fuerza") {
    return [{ value: "votos_validos", label: "Votos por fuerza" }];
  }
  const base: MetricOption[] = [
    { value: "votos_validos", label: "Votos válidos" },
    { value: "lista_nominal", label: "Lista nominal" },
    { value: "participacion", label: "Participación %" },
    { value: "ganador", label: "Fuerza ganadora" },
  ];
  if (electionType === "municipal") {
    return [
      ...base,
      { value: "votos_ganador", label: "Votos del ganador" },
      { value: "porcentaje_ganador", label: "% del ganador" },
      { value: "margen_votos", label: "Margen en votos" },
      { value: "margen_porcentual", label: "Margen %" },
      { value: "votos_fuerza", label: "Votos de fuerza específica" },
    ];
  }
  return [
    ...base,
    { value: "margen_votos", label: "Margen en votos (calculado)" },
    { value: "votos_fuerza", label: "Votos de fuerza específica" },
  ];
}

// ─────────────────────────────────────────────
// Multi-Checkbox Popover (inline, no deps)
// ─────────────────────────────────────────────

function MultiCheckboxDropdown({
  label,
  options,
  selected,
  onChange,
  searchable = false,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const filtered = searchable
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;
  const selectedLabels = options.filter(opt => selected.includes(opt.value)).map(opt => opt.label);

  const toggle = (val: string) => {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex h-9 min-w-[160px] items-center justify-between gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs font-bold text-slate-100 hover:bg-slate-800 transition-colors"
      >
        <span className="truncate">
          {selected.length === 0 ? label : selected.length === 1 ? (selectedLabels[0] ?? label) : `${selected.length} seleccionados`}
        </span>
        <ChevronDown className="h-3 w-3 shrink-0 text-slate-500" />
      </button>
      {open && (
        <div className="absolute left-0 top-10 z-50 w-72 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
          {searchable && (
            <div className="flex items-center gap-2 border-b border-slate-800 p-2">
              <Search className="h-3 w-3 text-slate-500" />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar..."
                className="flex-1 bg-transparent text-xs font-medium text-slate-100 outline-none placeholder:text-slate-500"
              />
              {search && <button onClick={() => setSearch("")}><X className="h-3 w-3 text-slate-500" /></button>}
            </div>
          )}
          <div className="flex max-h-60 flex-col overflow-y-auto p-1">
            {filtered.length === 0 && (
              <p className="p-3 text-center text-[11px] text-slate-500">Sin resultados</p>
            )}
            {filtered.map(opt => (
              <label key={opt.value} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 hover:bg-slate-800">
                <input
                  type="checkbox"
                  checked={selected.includes(opt.value)}
                  onChange={() => toggle(opt.value)}
                  className="h-3 w-3 rounded border-slate-600 accent-emerald-500"
                />
                <span className="text-xs font-medium text-slate-100">{opt.label}</span>
              </label>
            ))}
          </div>
          {selected.length > 0 && (
            <div className="border-t border-slate-800 p-2">
              <button
                onClick={() => onChange([])}
                className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-200"
              >
                Limpiar selección
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Simple Select
// ─────────────────────────────────────────────

function SimpleSelect<T extends string>({
  value,
  onChange,
  options,
  className = "",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as T)}
      className={`h-9 rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs font-bold text-slate-100 outline-none hover:bg-slate-800 transition-colors focus:border-emerald-500 ${className}`}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// ─────────────────────────────────────────────
// Color scale helper
// ─────────────────────────────────────────────

function cellBgStyle(value: number | null, scale: { min: number; max: number } | undefined): React.CSSProperties {
  if (value === null || !scale || scale.max === scale.min) return {};
  const pct = (value - scale.min) / (scale.max - scale.min);
  const alpha = 0.08 + pct * 0.42; // 0.08 → 0.50
  return { backgroundColor: `rgba(16, 185, 129, ${alpha.toFixed(2)})` };
}

function ganadorBgStyle(siglas: string | null): React.CSSProperties {
  if (!siglas) return {};
  const color = getPartyColor(siglas);
  return { backgroundColor: `${color}20` };
}

// ─────────────────────────────────────────────
// Metric formatting
// ─────────────────────────────────────────────

function formatCellValue(value: number | string | null, metric: PivotMetric): string {
  if (value === null) return "—";
  if (typeof value === "string") return value;
  switch (metric) {
    case "participacion":
    case "porcentaje_ganador":
    case "margen_porcentual":
      return `${value.toLocaleString("es-MX", { maximumFractionDigits: 2 })}%`;
    default:
      return value.toLocaleString("es-MX");
  }
}

// ─────────────────────────────────────────────
// Pivot Table sub-component
// ─────────────────────────────────────────────

function PivotTableView({
  result,
  displayRows,
  colorScales,
  sortCol,
  sortDir,
  onSort,
  rowDim,
}: {
  result: PivotResult;
  displayRows: typeof result.rows;
  colorScales: Record<string, { min: number; max: number }>;
  sortCol: string | null;
  sortDir: "asc" | "desc";
  onSort: (col: string) => void;
  rowDim: PivotRowDim;
}) {
  const isNumeric = result.config.metric !== "ganador";
  const isYearColumns = result.config.colDim === "anio";

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800 shadow-2xl">
      <Table>
        <TableHeader className="bg-slate-900">
          <TableRow>
            <TableHead
              className="sticky left-0 z-10 bg-slate-900 backdrop-blur-sm min-w-[160px] font-black text-[10px] uppercase tracking-widest p-4 border-r border-slate-800 text-slate-200 cursor-pointer select-none"
              onClick={() => onSort("__label__")}
            >
              <div className="flex items-center gap-1">
                {rowDim === "municipio" ? "Municipio" : rowDim === "distrito" ? "Distrito" : rowDim === "region" ? "Región" : "Sección"}
                {sortCol === "__label__" ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-slate-300" />}
              </div>
            </TableHead>
            {result.columns.map(col => (
              <TableHead
                key={col.key}
                className={`font-black text-[10px] uppercase tracking-widest p-4 min-w-[110px] text-slate-200 cursor-pointer select-none hover:bg-slate-800 transition-colors ${
                  isYearColumns ? "text-center" : "text-right"
                }`}
                onClick={() => onSort(col.key)}
              >
                <div className={`flex items-center gap-1 ${isYearColumns ? "justify-center" : "justify-end"}`}>
                  <span>{col.label}</span>
                  {sortCol === col.key ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-slate-300" />}
                </div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {displayRows.map(row => (
            <TableRow key={row.key} className="hover:bg-slate-900/80 align-middle border-slate-800">
              <TableCell
                className={`sticky left-0 z-10 bg-slate-950/95 backdrop-blur-sm p-4 border-r border-slate-800 text-slate-100 ${
                  rowDim === "seccion"
                    ? "font-semibold text-[12px] tracking-normal normal-case"
                    : "font-black text-[11px] uppercase tracking-tighter"
                }`}
              >
                {rowDim === "municipio" && row.meta?.municipioId ? (
                  <Link
                    href={`/admin/historial/municipio/${row.meta.municipioId}`}
                    className="hover:text-blue-600 hover:underline transition-colors"
                  >
                    {row.label}
                  </Link>
                ) : (
                  row.label
                )}
              </TableCell>
              {result.columns.map(col => {
                const val = row.cells[col.key];
                const isText = typeof val === "string";
                const bgStyle = isText
                  ? ganadorBgStyle(val)
                  : cellBgStyle(typeof val === "number" ? val : null, colorScales[col.key]);

                return (
                  <TableCell key={col.key} className={`p-3 ${isYearColumns ? "text-center" : "text-right"}`} style={bgStyle}>
                    {val === null ? (
                      <span className="text-[11px] font-bold text-slate-600">—</span>
                    ) : isText ? (
                      <Badge
                        className="rounded-md px-2 py-0.5 text-[10px] font-black text-white"
                        style={{ backgroundColor: getPartyColor(val) }}
                      >
                        {val}
                      </Badge>
                    ) : (
                      <span className={`text-[11px] font-black tabular-nums ${isYearColumns ? "text-slate-900" : "text-slate-100"}`}>
                        {formatCellValue(val, result.config.metric)}
                      </span>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}

          {/* Totals row */}
          {isNumeric && (
            <TableRow className="bg-slate-900 border-t-2 border-slate-700 font-black">
              <TableCell className="sticky left-0 z-10 bg-slate-900 backdrop-blur-sm p-4 border-r border-slate-700 text-[10px] font-black uppercase tracking-widest text-slate-300">
                TOTAL
              </TableCell>
              {result.columns.map(col => (
                <TableCell key={col.key} className={`p-3 text-[11px] font-black tabular-nums text-emerald-300 ${isYearColumns ? "text-center" : "text-right"}`}>
                  {result.totals[col.key] !== null
                    ? formatCellValue(result.totals[col.key], result.config.metric)
                    : "—"}
                </TableCell>
              ))}
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────

interface Props {
  initialData: ConsultaInitialData;
}

type UIStatus = "idle" | "loading" | "error" | "empty" | "results";

export default function ConsultaAvanzada({ initialData }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasHydratedFromUrl = useRef(false);

  // Config state
  const [rowDim, setRowDim] = useState<PivotRowDim>("municipio");
  const [colDim, setColDim] = useState<PivotColDim>("fuerza");
  const [metric, setMetric] = useState<PivotMetric>("votos_validos");
  const [electionType, setElectionType] = useState<ElectionType>("municipal");
  const [selectedAnios, setSelectedAnios] = useState<number[]>([]);
  const [selectedMunicipios, setSelectedMunicipios] = useState<number[]>([]);
  const [selectedDistrito, setSelectedDistrito] = useState<string>("");
  const [selectedRegion, setSelectedRegion] = useState<string>("");
  const [fuerzaFiltro, setFuerzaFiltro] = useState<string[]>([]);
  const [selectedFuerza, setSelectedFuerza] = useState<string>("");

  // Result state
  const [result, setResult] = useState<PivotResult | null>(null);
  const [status, setStatus] = useState<UIStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [isPending, startTransition] = useTransition();

  // Sort state
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Search within table rows
  const [rowSearch, setRowSearch] = useState("");

  function buildSearchParams(config: PivotConfig): URLSearchParams {
    const params = new URLSearchParams();
    params.set("rowDim", config.rowDim);
    params.set("colDim", config.colDim);
    params.set("metric", config.metric);
    params.set("electionType", config.electionType);
    if (config.anios.length > 0) params.set("anios", config.anios.join(","));
    if (config.municipioIds.length > 0) params.set("municipioIds", config.municipioIds.join(","));
    if (config.distrito) params.set("distrito", config.distrito);
    if (config.region) params.set("region", config.region);
    if (config.fuerzaFiltro && config.fuerzaFiltro.length > 0) params.set("fuerzaFiltro", config.fuerzaFiltro.join(","));
    if (config.selectedFuerza) params.set("selectedFuerza", config.selectedFuerza);
    return params;
  }

  useEffect(() => {
    if (hasHydratedFromUrl.current) return;
    hasHydratedFromUrl.current = true;

    const rowDimParam = searchParams.get("rowDim");
    const colDimParam = searchParams.get("colDim");
    const metricParam = searchParams.get("metric");
    const electionTypeParam = searchParams.get("electionType");
    const aniosParam = parseCsvParam(searchParams.get("anios")).map(Number).filter(Number.isFinite);
    const municipioIdsParam = parseCsvParam(searchParams.get("municipioIds")).map(Number).filter(Number.isFinite);
    const distritoParam = searchParams.get("distrito") ?? "";
    const regionParam = searchParams.get("region") ?? "";
    const fuerzaFiltroParam = parseCsvParam(searchParams.get("fuerzaFiltro"));
    const selectedFuerzaParam = searchParams.get("selectedFuerza") ?? "";

    if (rowDimParam && ROW_DIM_VALUES.includes(rowDimParam as PivotRowDim)) setRowDim(rowDimParam as PivotRowDim);
    if (colDimParam && COL_DIM_VALUES.includes(colDimParam as PivotColDim)) setColDim(colDimParam as PivotColDim);
    if (metricParam && METRIC_VALUES.includes(metricParam as PivotMetric)) setMetric(metricParam as PivotMetric);
    if (electionTypeParam && ELECTION_TYPE_VALUES.includes(electionTypeParam as ElectionType)) setElectionType(electionTypeParam as ElectionType);
    if (aniosParam.length > 0) setSelectedAnios(aniosParam);
    if (municipioIdsParam.length > 0) setSelectedMunicipios(municipioIdsParam);
    if (distritoParam) setSelectedDistrito(distritoParam);
    if (regionParam) setSelectedRegion(regionParam);
    if (fuerzaFiltroParam.length > 0) setFuerzaFiltro(fuerzaFiltroParam);
    if (selectedFuerzaParam) setSelectedFuerza(selectedFuerzaParam);
  }, [searchParams]);

  // Sync metric when colDim/electionType changes
  const availableMetrics = getAvailableMetrics(colDim, electionType);
  useEffect(() => {
    if (!availableMetrics.find(m => m.value === metric)) {
      setMetric(availableMetrics[0]?.value ?? "votos_validos");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colDim, electionType]);

  // Reset rowDim to municipio when switching to gubernatura_municipal (seccion is not valid there)
  useEffect(() => {
    if (electionType === "gubernatura_municipal" && rowDim === "seccion") {
      setRowDim("municipio");
    }
  }, [electionType, rowDim]);

  const isGubernatura = electionType === "gubernatura" || electionType === "gubernatura_municipal";

  const availableYears = useMemo(() => {
    if (isGubernatura) return [2023];
    if (electionType === "municipal") return initialData.years.municipal;
    return [...new Set([...initialData.years.seccional, 2023])].sort((a, b) => a - b);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [electionType, initialData.years]);

  const availableFuerzas = useMemo(() => {
    if (isGubernatura) return initialData.fuerzas.gubernatura;
    return electionType === "municipal" ? initialData.fuerzas.municipal : initialData.fuerzas.seccional;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [electionType, initialData.fuerzas]);

  const yearOptionsForUI = useMemo(() => {
    const base = [...availableYears];
    if (electionType === "seccional" && !base.includes(2023)) base.push(2023);
    return [...new Set(base)].sort((a, b) => a - b);
  }, [availableYears, electionType]);

  // Sorted + filtered display rows
  const displayRows = useMemo(() => {
    if (!result) return [];
    let rows = [...result.rows];

    // Text search on label
    if (rowSearch.trim()) {
      const q = rowSearch.trim().toLowerCase();
      rows = rows.filter(r => r.label.toLowerCase().includes(q));
    }

    if (!sortCol) return rows;

    return rows.sort((a, b) => {
      if (sortCol === "__label__") {
        return sortDir === "asc"
          ? a.label.localeCompare(b.label, "es")
          : b.label.localeCompare(a.label, "es");
      }
      const va = a.cells[sortCol];
      const vb = b.cells[sortCol];
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      const na = typeof va === "number" ? va : parseFloat(String(va));
      const nb = typeof vb === "number" ? vb : parseFloat(String(vb));
      if (!isNaN(na) && !isNaN(nb)) return sortDir === "asc" ? na - nb : nb - na;
      return sortDir === "asc"
        ? String(va).localeCompare(String(vb), "es")
        : String(vb).localeCompare(String(va), "es");
    });
  }, [result, sortCol, sortDir, rowSearch]);

  // Color scales per column (numeric only)
  const colorScales = useMemo(() => {
    if (!result || result.config.metric === "ganador") return {};
    const scales: Record<string, { min: number; max: number }> = {};
    for (const col of result.columns) {
      const vals = result.rows
        .map(r => r.cells[col.key])
        .filter((v): v is number => typeof v === "number");
      if (vals.length > 1) {
        scales[col.key] = { min: Math.min(...vals), max: Math.max(...vals) };
      }
    }
    return scales;
  }, [result]);

  function handleSort(col: string) {
    if (sortCol === col) {
      if (sortDir === "desc") setSortDir("asc");
      else { setSortCol(null); }
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  }

  function handleQuery() {
    startTransition(async () => {
      setStatus("loading");
      setResult(null);
      setRowSearch("");
      setSortCol(null);
      try {
        const config: PivotConfig = {
          rowDim,
          colDim,
          metric: colDim === "fuerza" ? "votos_validos" : metric,
          electionType,
          anios: isGubernatura ? [2023] : selectedAnios,
          municipioIds: selectedMunicipios,
          distrito: selectedDistrito || undefined,
          region: selectedRegion || undefined,
          fuerzaFiltro: fuerzaFiltro.length > 0 ? fuerzaFiltro : undefined,
          selectedFuerza: selectedFuerza || undefined,
        };
        const params = buildSearchParams(config);
        router.replace(`/admin/historial/consulta?${params.toString()}`, { scroll: false });
        const data = await getPivotData(config);
        setResult(data);
        setStatus(data.rows.length === 0 ? "empty" : "results");
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "Error al consultar");
        setStatus("error");
      }
    });
  }

  function handleReset() {
    setRowDim("municipio");
    setColDim("fuerza");
    setMetric("votos_validos");
    setElectionType("municipal");
    setSelectedAnios([]);
    setSelectedMunicipios([]);
    setSelectedDistrito("");
    setSelectedRegion("");
    setFuerzaFiltro([]);
    setSelectedFuerza("");
    setResult(null);
    setStatus("idle");
    setRowSearch("");
    setSortCol(null);
    router.replace("/admin/historial/consulta", { scroll: false });
  }

  function handleExportCSV() {
    if (!result) return;
    const colHeaders = result.columns.map(c => c.label);
    const dimHeader = rowDim === "municipio" ? "Municipio" : rowDim === "distrito" ? "Distrito" : rowDim === "region" ? "Región" : "Sección";
    const headers = [dimHeader, ...colHeaders];
    const dataRows = displayRows.map(r => [r.label, ...result.columns.map(c => r.cells[c.key] ?? "")]);
    const totalsRow = result.config.metric !== "ganador"
      ? ["TOTAL", ...result.columns.map(c => result.totals[c.key] ?? "")]
      : null;
    const allRows = totalsRow ? [...dataRows, totalsRow] : dataRows;
    const csv = [headers, ...allRows]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `consulta-electoral-${electionType}-${rowDim}-${colDim}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const needsMunicipioFilter = rowDim === "seccion";
  const showFuerzaSelector = colDim === "anio" && metric === "votos_fuerza";
  const showFuerzaFiltro = colDim === "fuerza";
  const showDistritoFilter = rowDim === "distrito";
  const showRegionFilter = rowDim === "region";

  const municipioOptions = initialData.municipios.map(m => ({
    value: String(m.id),
    label: m.nombre,
  }));

  const fuerzaOptions = availableFuerzas.map(f => ({ value: f, label: f }));

  return (
    <div className="space-y-4">
      {/* Control Panel */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
        <div className="border-b border-slate-800 px-6 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">
            War Room · Configuracion de la tabla
          </p>
        </div>
        <div className="p-6 space-y-4">
          {/* Row 1: Structure */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">Filas</p>
              <SimpleSelect
                value={rowDim}
                onChange={v => { setRowDim(v); setSelectedMunicipios([]); }}
                options={[
                  { value: "municipio", label: "Municipio" },
                  { value: "distrito", label: "Distrito" },
                  { value: "region", label: "Región" },
                  ...(electionType !== "gubernatura_municipal" ? [{ value: "seccion" as PivotRowDim, label: "Sección" }] : []),
                ]}
                className="w-full"
              />
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">Columnas</p>
              <SimpleSelect
                value={colDim}
                onChange={setColDim}
                options={[
                  { value: "fuerza", label: "Fuerza política" },
                  { value: "anio", label: "Año" },
                ]}
                className="w-full"
              />
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">Metrica</p>
              {colDim === "anio" ? (
                <SimpleSelect
                  value={metric}
                  onChange={setMetric}
                  options={availableMetrics}
                  className="w-full"
                />
              ) : (
                <div className="flex h-9 items-center rounded-xl border border-slate-800 bg-slate-900 px-3 text-xs font-bold text-slate-500">
                  Votos por fuerza
                </div>
              )}
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">Tipo</p>
              <SimpleSelect
                value={electionType}
                onChange={v => { setElectionType(v); setSelectedAnios([]); setFuerzaFiltro([]); setSelectedFuerza(""); }}
                options={[
                  { value: "municipal", label: "Municipal oficial" },
                  { value: "seccional", label: "Seccional" },
                  { value: "gubernatura", label: "Gubernatura 2023 (seccional)" },
                  { value: "gubernatura_municipal", label: "Gubernatura 2023 (municipal)" },
                ]}
                className="w-full"
              />
            </div>
          </div>

          {/* Row 2: Filters */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {/* Años */}
            {!isGubernatura && yearOptionsForUI.length > 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 xl:col-span-2">
                <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">Años</p>
                <div className="flex flex-wrap gap-1.5">
                  {yearOptionsForUI.map(y => {
                    const active = selectedAnios.includes(y);
                    return (
                      <button
                        key={y}
                        type="button"
                        onClick={() => setSelectedAnios(prev => active ? prev.filter(a => a !== y) : [...prev, y])}
                        className={`rounded-lg border px-3 py-1.5 text-[11px] font-black transition-colors ${active ? "border-emerald-400 bg-emerald-500/20 text-emerald-300" : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"}`}
                      >
                        {y}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Municipios (required for seccion, optional otherwise) */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 xl:col-span-2">
              <p className={`mb-2 text-[10px] font-black uppercase tracking-widest ${needsMunicipioFilter ? "text-rose-400" : "text-slate-500"}`}>
                {needsMunicipioFilter ? "Municipio*" : "Municipios"}
              </p>
              <MultiCheckboxDropdown
                label="Todos los municipios"
                options={municipioOptions}
                selected={selectedMunicipios.map(String)}
                onChange={vals => setSelectedMunicipios(vals.map(Number))}
                searchable
              />
            </div>

            {/* Distrito filter */}
            {showDistritoFilter && initialData.distritos.length > 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">Distrito</p>
                <SimpleSelect
                  value={selectedDistrito as never}
                  onChange={v => setSelectedDistrito(v)}
                  options={[{ value: "" as never, label: "Todos" }, ...initialData.distritos.map(d => ({ value: d as never, label: d }))]}
                  className="w-full"
                />
              </div>
            )}

            {/* Region filter */}
            {showRegionFilter && initialData.regiones.length > 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">Region</p>
                <SimpleSelect
                  value={selectedRegion as never}
                  onChange={v => setSelectedRegion(v)}
                  options={[{ value: "" as never, label: "Todas" }, ...initialData.regiones.map(r => ({ value: r as never, label: r }))]}
                  className="w-full"
                />
              </div>
            )}

            {/* Fuerzas visibles filter (when colDim=fuerza) */}
            {showFuerzaFiltro && fuerzaOptions.length > 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 xl:col-span-2">
                <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">Fuerzas visibles</p>
                <MultiCheckboxDropdown
                  label="Todas las fuerzas"
                  options={fuerzaOptions}
                  selected={fuerzaFiltro}
                  onChange={setFuerzaFiltro}
                />
              </div>
            )}

            {/* Fuerza específica (when metric=votos_fuerza) */}
            {showFuerzaSelector && fuerzaOptions.length > 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 xl:col-span-2">
                <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-rose-400">Fuerza objetivo*</p>
                <SimpleSelect
                  value={selectedFuerza as never}
                  onChange={v => setSelectedFuerza(v)}
                  options={[{ value: "" as never, label: "Seleccionar..." }, ...fuerzaOptions.map(f => ({ value: f.value as never, label: f.label }))]}
                  className="w-full"
                />
              </div>
            )}
          </div>

          {/* Validation warnings */}
          {needsMunicipioFilter && selectedMunicipios.length === 0 && (
            <p className="flex items-center gap-1.5 text-[11px] font-black text-rose-500">
              <AlertCircle className="h-3 w-3" /> Selecciona al menos un municipio para consultas por sección.
            </p>
          )}
          {showFuerzaSelector && !selectedFuerza && (
            <p className="flex items-center gap-1.5 text-[11px] font-black text-rose-500">
              <AlertCircle className="h-3 w-3" /> Selecciona una fuerza política para esta métrica.
            </p>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-3 pt-2 border-t border-slate-800">
            <Button
              onClick={handleQuery}
              disabled={isPending || (needsMunicipioFilter && selectedMunicipios.length === 0) || (showFuerzaSelector && !selectedFuerza)}
              className="rounded-xl bg-emerald-500 text-slate-950 font-black px-8 h-10 hover:bg-emerald-400 shadow-lg"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <TableIcon className="h-4 w-4 mr-2" />}
              Consultar
            </Button>
            <Button
              variant="outline"
              onClick={handleExportCSV}
              disabled={!result || result.rows.length === 0}
              className="rounded-xl font-bold h-10 border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
            >
              <Download className="h-4 w-4 mr-2" /> Exportar CSV
            </Button>
            <Button
              variant="ghost"
              onClick={handleReset}
              className="rounded-xl font-bold h-10 text-slate-400 hover:text-white hover:bg-slate-800"
            >
              Limpiar
            </Button>
          </div>
        </div>
      </div>

      {/* Results area */}
      {(isPending || status === "loading") && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-16 flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Procesando consulta…</p>
        </div>
      )}

      {status === "idle" && !isPending && (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/30 p-16 flex flex-col items-center gap-3 text-center">
          <div className="h-14 w-14 bg-white rounded-2xl shadow-sm flex items-center justify-center border border-slate-200">
            <TableIcon className="h-7 w-7 text-slate-300" />
          </div>
          <p className="font-black text-slate-500 text-sm uppercase tracking-widest">Configura la tabla y presiona Consultar</p>
          <p className="text-xs text-slate-400 max-w-sm">Selecciona dimensiones de filas y columnas, el tipo de elección y la métrica a comparar.</p>
        </div>
      )}

      {status === "error" && !isPending && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-black text-rose-700 text-sm">Error en la consulta</p>
            <p className="text-xs text-rose-600 mt-1">{errorMsg}</p>
          </div>
        </div>
      )}

      {status === "empty" && !isPending && (
        <div className="rounded-2xl border border-slate-200 bg-white p-16 flex flex-col items-center gap-3 text-center">
          <p className="font-black text-slate-500 text-sm">Sin resultados para la configuración seleccionada</p>
          <p className="text-xs text-slate-400">Prueba con otros filtros o años.</p>
        </div>
      )}

      {status === "results" && result && !isPending && (
        <div className="space-y-3">
          {/* Result meta bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2">
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-slate-800 text-slate-100 border-none text-[10px] font-black uppercase">
                {result.meta.totalRows} filas
              </Badge>
              <Badge className="bg-slate-800 text-slate-100 border-none text-[10px] font-black uppercase">
                {result.columns.length} columnas
              </Badge>
              {result.meta.truncated && (
                <Badge className="bg-amber-500/20 text-amber-300 border-none text-[10px] font-black uppercase">
                  ⚠ Muestra limitada a 200 secciones
                </Badge>
              )}
              {result.meta.years.length > 0 && (
                <Badge className="bg-blue-500/20 text-blue-300 border-none text-[10px] font-black uppercase">
                  {result.meta.years.join(" · ")}
                </Badge>
              )}
              {["participacion", "porcentaje_ganador", "margen_porcentual"].includes(result.config.metric) && (
                <Badge
                  className="bg-violet-500/20 text-violet-300 border-none text-[10px] font-black uppercase cursor-help"
                  title="Los porcentajes se agregan de forma ponderada por volumen de votos/lista nominal."
                >
                  % ponderado
                </Badge>
              )}
            </div>
            {/* Row search */}
            <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 h-9">
              <Search className="h-3 w-3 text-slate-500" />
              <input
                value={rowSearch}
                onChange={e => setRowSearch(e.target.value)}
                placeholder="Filtrar filas..."
                className="bg-transparent text-xs font-medium text-slate-100 outline-none placeholder:text-slate-500 w-36"
              />
              {rowSearch && (
                <button onClick={() => setRowSearch("")}><X className="h-3 w-3 text-slate-400" /></button>
              )}
            </div>
          </div>

          <PivotTableView
            result={result}
            displayRows={displayRows}
            colorScales={colorScales}
            sortCol={sortCol}
            sortDir={sortDir}
            onSort={handleSort}
            rowDim={rowDim}
          />
        </div>
      )}
    </div>
  );
}
