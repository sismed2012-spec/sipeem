"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { upsertHistorialManual } from "@/actions/historial";
import {
  Municipio,
  Partido,
  HistorialElectoralDetalle,
  HistorialResultado,
} from "@/lib/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Trash2, Plus, AlertCircle } from "lucide-react";

type HistorialFormProps = {
  initialData?: HistorialElectoralDetalle;
  municipios: Municipio[];
  partidos: Partido[];
};

export default function HistorialForm({
  initialData,
  municipios,
  partidos,
}: HistorialFormProps) {
  type HistorialMainPayload = Parameters<typeof upsertHistorialManual>[0];
  type HistorialResultadosPayload = Parameters<typeof upsertHistorialManual>[1];
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // CONTROLLED STATE FOR SELECTS
  const [municipioId, setMunicipioId] = useState<string>(
    initialData?.municipio_id?.toString() || ""
  );
  const [partidoGanadorId, setPartidoGanadorId] = useState<string>(
    initialData?.partido_ganador_id?.toString() || ""
  );

  const [resultados, setResultados] = useState<
    Partial<HistorialResultado & { partido_siglas?: string }>[]
  >(
    initialData?.resultados?.map((r) => ({
      partido_id: r.partido_id,
      votos: r.votos,
      porcentaje: r.porcentaje,
      posicion: r.posicion,
      partido_siglas: r.partido?.siglas,
    })) || []
  );

  const isEdit = !!initialData;

  const addResultado = () => {
    setResultados([
      ...resultados,
      { partido_id: 0, votos: 0, porcentaje: 0, posicion: resultados.length + 1 },
    ]);
  };

  const removeResultado = (index: number) => {
    setResultados(resultados.filter((_, i) => i !== index));
  };

  const updateResultado = (
    index: number,
    field: "partido_id" | "votos" | "porcentaje" | "posicion",
    value: number
  ) => {
    const updated = [...resultados];
    updated[index] = { ...updated[index], [field]: value };
    setResultados(updated);
  };

  const rankedResults = useMemo(() => {
    return [...resultados]
      .sort((a, b) => (Number(b.votos) || 0) - (Number(a.votos) || 0))
      .map((r, i) => ({ ...r, posicion: i + 1 }));
  }, [resultados]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);

    // READ FROM STATE, NOT FORMDATA FOR SELECTS
    const munId = parseInt(municipioId);
    const winnerId = parseInt(partidoGanadorId);
    
    const anio = parseInt(formData.get("anio") as string);
    const winnerVotes = parseInt(formData.get("votos_ganador") as string);
    const winnerPct = parseFloat(formData.get("porcentaje_ganador") as string);

    try {
      if (!munId) throw new Error("Debe seleccionar un municipio.");
      if (!winnerId) throw new Error("Debe seleccionar un partido ganador.");
      if (isNaN(anio)) throw new Error("Debe ingresar un año válido.");

      if (resultados.length === 0) {
        throw new Error("Debe registrar al menos un resultado por partido.");
      }

      const partyIds = resultados
        .map((r) => r.partido_id)
        .filter((id): id is number => typeof id === "number" && id > 0);

      if (partyIds.length !== resultados.length) {
        throw new Error("Todos los partidos en el desglose deben ser seleccionados.");
      }

      if (new Set(partyIds).size !== partyIds.length) {
        throw new Error("No puede haber partidos repetidos en el desglose.");
      }

      const hasInvalidNumbers = resultados.some(
        (r) =>
          Number.isNaN(Number(r.votos)) ||
          Number(r.votos) < 0 ||
          Number.isNaN(Number(r.porcentaje)) ||
          Number(r.porcentaje) < 0 ||
          Number(r.porcentaje) > 100
      );

      if (hasInvalidNumbers) {
        throw new Error("Los votos y porcentajes deben ser números válidos y positivos.");
      }

      const winnerInBreakdown = resultados.find((r) => r.partido_id === winnerId);

      if (!winnerInBreakdown) {
        throw new Error(
          "El partido ganador seleccionado debe estar presente en la tabla de desglose."
        );
      }

      if (Number(winnerInBreakdown.votos) !== winnerVotes) {
        throw new Error(
          `Inconsistencia: Los votos del ganador (${winnerVotes}) no coinciden con los votos del partido en el desglose (${winnerInBreakdown.votos}).`
        );
      }

      const mainData: HistorialMainPayload = {
        id: initialData?.id,
        municipio_id: munId,
        anio,
        partido_ganador_id: winnerId,
        votos_ganador: winnerVotes,
        porcentaje_ganador: winnerPct,
        fuente: (formData.get("fuente") as string) || "",
        notas: (formData.get("notas") as string) || "",
      };

      const resultadosPayload: HistorialResultadosPayload = rankedResults.map(
        (resultado) => ({
          partido_id: resultado.partido_id,
          votos: resultado.votos,
          porcentaje: resultado.porcentaje,
          posicion: resultado.posicion,
        })
      );

      await upsertHistorialManual(mainData, resultadosPayload);

      toast.success(isEdit ? "Registro actualizado" : "Registro creado correctamente");
      router.push("/admin/historial");
      router.refresh();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Error al procesar la solicitud";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <Card className="lg:col-span-1 border-slate-200 shadow-xl rounded-2xl h-fit sticky top-24 overflow-hidden bg-white">
        <form onSubmit={handleSubmit} id="historial-form">
          <CardHeader className="bg-slate-50 border-b border-slate-100 p-6">
            <CardTitle className="text-xl font-black text-slate-900 uppercase tracking-tighter">
              Eventos Base
            </CardTitle>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">
              Identidad de la elección
            </p>
          </CardHeader>

          <CardContent className="p-6 space-y-6">
            <div className="space-y-2">
              <Label className="font-black text-[10px] uppercase tracking-widest text-slate-500">
                Municipio de Interés
              </Label>
              <Select
                value={municipioId}
                onValueChange={(v) => setMunicipioId(v ?? "")}
                required
              >
                <SelectTrigger className="rounded-xl border-slate-200 h-11 bg-white">
                  <SelectValue placeholder="Seleccione municipio" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {municipios.map((m) => (
                    <SelectItem key={m.id} value={m.id.toString()}>
                      {m.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-black text-[10px] uppercase tracking-widest text-slate-500">
                  Año de la Contienda
                </Label>
                <Input
                  name="anio"
                  type="number"
                  defaultValue={initialData?.anio}
                  required
                  className="rounded-xl border-slate-200 h-11 bg-white font-bold"
                />
              </div>

              <div className="space-y-2">
                <Label className="font-black text-[10px] uppercase tracking-widest text-slate-500">
                  Votos Ganador
                </Label>
                <Input
                  name="votos_ganador"
                  type="number"
                  defaultValue={initialData?.votos_ganador}
                  required
                  className="rounded-xl border-slate-200 h-11 bg-white font-black"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-black text-[10px] uppercase tracking-widest text-slate-500">
                Fuerza Victoriosa
              </Label>
              <Select
                value={partidoGanadorId}
                onValueChange={(v) => setPartidoGanadorId(v ?? "")}
                required
              >
                <SelectTrigger className="rounded-xl border-slate-200 h-11 bg-white">
                  <SelectValue placeholder="Seleccione partido" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {partidos.map((p) => (
                    <SelectItem key={p.id} value={p.id.toString()}>
                      {p.siglas} — {p.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="font-black text-[10px] uppercase tracking-widest text-slate-500">
                % Ganador Real (IEPC)
              </Label>
              <Input
                name="porcentaje_ganador"
                type="number"
                step="0.01"
                defaultValue={initialData?.porcentaje_ganador}
                required
                className="rounded-xl border-slate-200 h-11 bg-white font-bold text-emerald-600"
              />
            </div>

            <div className="space-y-2">
              <Label className="font-black text-[10px] uppercase tracking-widest text-slate-500">
                Fuente de Información
              </Label>
              <Input
                name="fuente"
                defaultValue={initialData?.fuente ?? ""}
                placeholder="Ej. PREP Guerrero / IEPC"
                className="rounded-xl border-slate-200 h-11 bg-white font-medium"
              />
            </div>

            <div className="space-y-2">
              <Label className="font-black text-[10px] uppercase tracking-widest text-slate-500">
                Notas Internas
              </Label>
              <Textarea
                name="notas"
                defaultValue={initialData?.notas ?? ""}
                className="rounded-xl border-slate-200 min-h-[80px] bg-white resize-none"
              />
            </div>

            {error && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-red-700 text-[11px] font-black uppercase tracking-tight flex items-start gap-2 shadow-sm">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </CardContent>

          <CardFooter className="bg-slate-50 border-t border-slate-100 p-6 flex flex-col gap-3">
            <Button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-slate-900 font-black h-12 transition-all hover:bg-slate-800 shadow-xl active:scale-[0.98]"
            >
              {loading
                ? "Confirmando..."
                : isEdit
                  ? "Actualizar Registro"
                  : "Publicar Historial"}
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={loading}
              className="w-full rounded-xl border-slate-200 font-bold h-11 bg-white"
            >
              Descartar cambios
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card className="lg:col-span-2 border-slate-200 shadow-xl rounded-2xl overflow-hidden bg-white/50 backdrop-blur-sm">
        <CardHeader className="bg-white/80 border-b border-slate-100 p-6 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl font-black text-slate-900 uppercase tracking-tighter">
              Desglose Relacional
            </CardTitle>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">
              Ranking de fuerzas electorales
            </p>
          </div>

          <Button
            onClick={addResultado}
            type="button"
            variant="outline"
            size="sm"
            className="rounded-lg border-slate-200 bg-white font-black text-[10px] uppercase tracking-[0.2em] shadow-sm hover:bg-slate-50 transition-all"
          >
            <Plus className="h-3 w-3 mr-1" /> Fila de Partido
          </Button>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-black text-slate-600 uppercase text-[10px] tracking-widest px-6 py-4 w-12 text-center">
                  Pos
                </TableHead>
                <TableHead className="font-black text-slate-600 uppercase text-[10px] tracking-widest px-6 py-4">
                  Fuerza Política
                </TableHead>
                <TableHead className="font-black text-slate-600 uppercase text-[10px] tracking-widest px-6 py-4 text-center">
                  Votos
                </TableHead>
                <TableHead className="font-black text-slate-600 uppercase text-[10px] tracking-widest px-6 py-4 text-center w-28">
                  % Final
                </TableHead>
                <TableHead className="px-6 py-4 w-12"></TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {resultados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-24 text-center">
                    <p className="text-slate-400 italic font-black text-sm uppercase tracking-widest opacity-60">
                      Sin datos de participación registrados
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                resultados.map((res, index) => {
                  const rank = rankedResults[index]?.posicion || index + 1;

                  return (
                    <TableRow
                      key={index}
                      className="border-slate-100 group transition-colors hover:bg-white"
                    >
                      <TableCell className="px-6 py-4 text-center font-black text-slate-400 text-xl group-hover:text-slate-900 transition-colors">
                        {rank}
                      </TableCell>

                      <TableCell className="px-6 py-4">
                        <Select
                          value={res.partido_id?.toString()}
                          onValueChange={(val) =>
                            updateResultado(index, "partido_id", Number(val) || 0)
                          }
                        >
                          <SelectTrigger className="rounded-xl border-slate-200 bg-white/50 h-11 focus:bg-white transition-all shadow-sm">
                            <SelectValue placeholder="Partido" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl shadow-2xl">
                            {partidos.map((p) => (
                              <SelectItem key={p.id} value={p.id.toString()}>
                                <div className="flex items-center gap-2">
                                  <div
                                    className="h-2 w-2 rounded-full border border-slate-200 shadow-sm"
                                    style={{ backgroundColor: p.color }}
                                  />
                                  <span className="font-bold">{p.siglas}</span>
                                  <span className="text-slate-400 font-medium">
                                    — {p.nombre}
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>

                      <TableCell className="px-6 py-4">
                        <Input
                          type="number"
                          value={res.votos ?? 0}
                          onChange={(e) =>
                            updateResultado(index, "votos", Number(e.target.value) || 0)
                          }
                          className="rounded-xl border-slate-200 bg-white/50 h-11 text-center font-black"
                        />
                      </TableCell>

                      <TableCell className="px-6 py-4">
                        <Input
                          type="number"
                          step="0.01"
                          value={res.porcentaje ?? 0}
                          onChange={(e) =>
                            updateResultado(
                              index,
                              "porcentaje",
                              Number(e.target.value) || 0
                            )
                          }
                          className="rounded-xl border-slate-200 bg-white/50 h-11 text-center font-black text-emerald-600"
                        />
                      </TableCell>

                      <TableCell className="px-6 py-4">
                        <Button
                          onClick={() => removeResultado(index)}
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-9 w-9 p-0 text-slate-300 hover:text-red-600 hover:bg-red-50 transition-all rounded-full"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
