"use client";

import { useState, useEffect, useRef, useCallback, type CSSProperties } from "react";
import { X, Loader2, GripHorizontal } from "lucide-react";
import type { SeccionDetalle } from "@/actions/estructura";
import { createDemografiaRequestCoordinator } from "@/lib/demografia-client";
import type { DemografiaSeccionResponse } from "@/lib/demografia-types";
import { createListaNominalRequestCoordinator } from "@/lib/lista-nominal-client";
import type { ListaNominalSeccionResponse } from "@/lib/lista-nominal-types";
import { DemografiaSeccionCard } from "./DemografiaSeccionCard";
import { ListaNominalSeccionCard } from "./ListaNominalSeccionCard";

type PopupBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const POPUP_MIN_W = 240;
const POPUP_MIN_H = 200;

export interface ArcGISSeccionProps {
  seccionId: number | null;
  numero: string | number;
  municipio: string | null;
  municipioClave: string | number | null;
  dto_federal: string | number | null;
  dto_local: string | number | null;
  tipo: string | null;
  control: string | number | null;
  municipioId: number | null;
}

interface Props {
  seccion: ArcGISSeccionProps;
  cartografiaVersionId: number | null;
  onClose: () => void;
}

export function SeccionPopup({ seccion, cartografiaVersionId, onClose }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [detalle, setDetalle] = useState<SeccionDetalle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [customBox, setCustomBox] = useState<PopupBox | null>(null);
  const [demografia, setDemografia] = useState<DemografiaSeccionResponse | null>(null);
  const [demografiaLoading, setDemografiaLoading] = useState(false);
  const [demografiaError, setDemografiaError] = useState(false);
  const [listaNominal, setListaNominal] =
    useState<ListaNominalSeccionResponse | null>(null);
  const [listaNominalLoading, setListaNominalLoading] = useState(false);
  const [listaNominalError, setListaNominalError] = useState(false);
  const demografiaCoordinatorRef = useRef<ReturnType<
    typeof createDemografiaRequestCoordinator
  > | null>(null);
  const listaNominalCoordinatorRef = useRef<ReturnType<
    typeof createListaNominalRequestCoordinator
  > | null>(null);

  if (demografiaCoordinatorRef.current === null) {
    demografiaCoordinatorRef.current = createDemografiaRequestCoordinator(
      async (_key, signal, input) => {
        const query = new URLSearchParams({
          versionId: String(input.versionId),
          censusYear: String(input.censusYear),
        });
        const response = await fetch(
          `/api/demografia/secciones/${input.sectionId}?${query.toString()}`,
          { signal, cache: "no-store" }
        );
        if (!response.ok) throw new Error("Demografía no disponible");
        return response.json() as Promise<DemografiaSeccionResponse>;
      },
      (value) => {
        setDemografia(value);
        if (value) setDemografiaLoading(false);
      },
      () => {
        setDemografiaError(true);
        setDemografiaLoading(false);
      }
    );
  }

  if (listaNominalCoordinatorRef.current === null) {
    listaNominalCoordinatorRef.current = createListaNominalRequestCoordinator(
      async (_key, signal, input) => {
        const query = new URLSearchParams({
          versionId: String(input.versionId),
        });
        if (input.cutoffDate) query.set("cutoffDate", input.cutoffDate);
        const response = await fetch(
          `/api/lista-nominal/secciones/${input.sectionId}?${query.toString()}`,
          { signal, cache: "no-store" }
        );
        if (!response.ok) throw new Error("Lista nominal no disponible");
        return response.json() as Promise<ListaNominalSeccionResponse>;
      },
      (value) => {
        setListaNominal(value);
        if (value) setListaNominalLoading(false);
      },
      () => {
        setListaNominalError(true);
        setListaNominalLoading(false);
      }
    );
  }

  const syncBoxFromDom = useCallback((): PopupBox | null => {
    const el = rootRef.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return null;
    const pr = parent.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    return {
      left: er.left - pr.left,
      top: er.top - pr.top,
      width: Math.max(POPUP_MIN_W, er.width),
      height: Math.max(POPUP_MIN_H, er.height),
    };
  }, []);

  const startDragHeader = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const parent = rootRef.current?.offsetParent as HTMLElement | null;
      if (!parent) return;
      const base = customBox ?? syncBoxFromDom();
      if (!base) return;
      setCustomBox(base);
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);

      const startX = e.clientX;
      const startY = e.clientY;
      const orig = { ...base };

      const clampBox = (next: PopupBox): PopupBox => {
        const pw = parent.clientWidth;
        const ph = parent.clientHeight;
        const maxL = Math.max(0, pw - next.width);
        const maxT = Math.max(0, ph - next.height);
        return {
          ...next,
          left: Math.min(maxL, Math.max(0, next.left)),
          top: Math.min(maxT, Math.max(0, next.top)),
        };
      };

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        setCustomBox(
          clampBox({
            ...orig,
            left: orig.left + dx,
            top: orig.top + dy,
          })
        );
      };

      const pid = e.pointerId;
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        try {
          e.currentTarget.releasePointerCapture(pid);
        } catch {
          /* ignore */
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [customBox, syncBoxFromDom]
  );

  const startResize = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const parent = rootRef.current?.offsetParent as HTMLElement | null;
      if (!parent) return;
      const base = customBox ?? syncBoxFromDom();
      if (!base) return;
      setCustomBox(base);
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);

      const startX = e.clientX;
      const startY = e.clientY;
      const orig = { ...base };

      const onMove = (ev: PointerEvent) => {
        const dw = ev.clientX - startX;
        const dh = ev.clientY - startY;
        const width = Math.max(POPUP_MIN_W, orig.width + dw);
        const height = Math.max(POPUP_MIN_H, orig.height + dh);
        const pw = parent.clientWidth;
        const ph = parent.clientHeight;
        let left = orig.left;
        let top = orig.top;
        if (left + width > pw) left = Math.max(0, pw - width);
        if (top + height > ph) top = Math.max(0, ph - height);
        setCustomBox({ left, top, width, height });
      };

      const pid = e.pointerId;
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        try {
          e.currentTarget.releasePointerCapture(pid);
        } catch {
          /* ignore */
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [customBox, syncBoxFromDom]
  );

  const resetLayout = useCallback(() => {
    setCustomBox(null);
  }, []);

  useEffect(() => {
    setCustomBox(null);
  }, [seccion.numero, seccion.municipioId]);

  useEffect(() => {
    if (!seccion.municipioId) return;
    setLoading(true);
    setError(false);
    import("@/actions/estructura")
      .then(({ getEstructuraBySeccion }) =>
        getEstructuraBySeccion(seccion.municipioId!, Number(seccion.numero))
      )
      .then(setDetalle)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [seccion.municipioId, seccion.numero]);

  useEffect(() => {
    const sectionId = seccion.seccionId;
    const coordinator = demografiaCoordinatorRef.current;
    if (!coordinator || sectionId === null || cartografiaVersionId === null) {
      coordinator?.clear();
      setDemografia(null);
      setDemografiaError(false);
      setDemografiaLoading(false);
      return;
    }

    setDemografiaError(false);
    setDemografiaLoading(true);
    void coordinator.select({ sectionId, versionId: cartografiaVersionId, censusYear: 2020 });
    return () => coordinator.clear();
  }, [cartografiaVersionId, seccion.seccionId]);

  useEffect(() => {
    const sectionId = seccion.seccionId;
    const coordinator = listaNominalCoordinatorRef.current;
    if (!coordinator || sectionId === null || cartografiaVersionId === null) {
      coordinator?.clear();
      setListaNominal(null);
      setListaNominalError(false);
      setListaNominalLoading(false);
      return;
    }

    setListaNominalError(false);
    setListaNominalLoading(true);
    void coordinator.select({
      sectionId,
      versionId: cartografiaVersionId,
      cutoffDate: null,
    });
    return () => coordinator.clear();
  }, [cartografiaVersionId, seccion.seccionId]);

  const daysSince =
    detalle?.ultimo_evento
      ? Math.floor(
          (Date.now() - new Date(detalle.ultimo_evento).getTime()) / 86_400_000
        )
      : null;

  const effectiveTipo = detalle?.tipo ?? seccion.tipo ?? "-";
  const effectiveListaNominal =
    listaNominal?.status === "AVAILABLE"
      ? (listaNominal.nominal?.total ?? detalle?.lista_nominal ?? null)
      : (detalle?.lista_nominal ?? null);

  const layoutClass = customBox
    ? "relative z-30 flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl pointer-events-auto 2xl:rounded-xl"
    : "absolute inset-x-3 bottom-[14.5rem] z-30 flex w-auto flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl pointer-events-auto 2xl:top-4 2xl:left-[calc(50%+10rem)] 2xl:bottom-auto 2xl:w-64 2xl:rounded-xl";

  const layoutStyle: CSSProperties | undefined = customBox
    ? {
        position: "absolute",
        left: customBox.left,
        top: customBox.top,
        width: customBox.width,
        height: customBox.height,
      }
    : undefined;

  return (
    <div ref={rootRef} className={layoutClass} style={layoutStyle}>
      <div
        role="group"
        aria-label="Panel de sección: arrastrar para mover"
        title="Arrastrar para mover · esquina inferior derecha para tamaño · doble clic restablece posición"
        onPointerDown={startDragHeader}
        onDoubleClick={resetLayout}
        className="flex shrink-0 cursor-grab touch-none select-none items-start justify-between bg-slate-950 px-4 py-2.5 active:cursor-grabbing"
      >
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <GripHorizontal
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500"
            aria-hidden
          />
          <div className="min-w-0">
            <div className="text-[12px] font-bold text-white">
              Sección {seccion.numero}
            </div>
            <div className="mt-0.5 text-[9px] text-slate-400">
              {seccion.municipio ?? "Municipio sin resolver"}
              {seccion.dto_local != null ? ` · Dto. Local ${seccion.dto_local}` : ""}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          onPointerDown={(ev) => ev.stopPropagation()}
          className="ml-2 mt-0.5 shrink-0 text-slate-400 transition-colors hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div
        className={
          customBox
            ? "min-h-0 flex-1 space-y-3 overflow-y-auto p-3"
            : "space-y-3 p-3"
        }
      >
        <div>
          <div className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">
            Cartografia base
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <StatCell label="Mun. clave" value={seccion.municipioClave ?? "-"} />
            <StatCell label="Dto. fed." value={seccion.dto_federal ?? "-"} />
            <StatCell label="Dto. local" value={seccion.dto_local ?? "-"} />
            <StatCell label="Control" value={seccion.control ?? "-"} />
          </div>
        </div>

        {cartografiaVersionId === null && (
          <p className="rounded border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] text-amber-800">
            Datos demográficos y nominales no disponibles sin versión cartográfica
          </p>
        )}

        <div>
          {listaNominalLoading && (
            <div
              className="flex items-center justify-center py-3"
              aria-label="Cargando lista nominal"
            >
              <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
            </div>
          )}
          {!listaNominalLoading && listaNominalError && (
            <p className="py-2 text-center text-[10px] text-slate-400">
              No se pudo consultar la lista nominal
            </p>
          )}
          {!listaNominalLoading && !listaNominalError && listaNominal && (
            <ListaNominalSeccionCard data={listaNominal} />
          )}
        </div>

        <div>
          <div className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">
            Supabase - Estructura
          </div>
          {loading && (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            </div>
          )}
          {!loading && (error || !detalle) && (
            <p className="py-2 text-center text-[11px] text-slate-400">
              No disponible
            </p>
          )}
          {!loading && detalle && (
            <>
              <div className="mb-2 grid grid-cols-2 gap-1.5">
                <StatCell
                  label="Lista nominal"
                  value={
                    effectiveListaNominal != null
                      ? effectiveListaNominal.toLocaleString("es-MX")
                      : "-"
                  }
                />
                <StatCell label="Tipo" value={effectiveTipo} />
                <StatCell
                  label="Promotor"
                  value={detalle.promotor ?? "Sin asignar"}
                  highlight={!!detalle.promotor}
                />
                <StatCell
                  label="Compromisos"
                  value={
                    detalle.meta > 0
                      ? `${detalle.compromisos} / ${detalle.meta}`
                      : String(detalle.compromisos)
                  }
                  highlight={detalle.compromisos > 0}
                />
              </div>
              {daysSince != null && (
                <div
                  className={`rounded border px-2.5 py-1.5 text-[10px] font-medium ${
                    daysSince > 14
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "border-emerald-200 bg-emerald-50 text-emerald-800"
                  }`}
                >
                  {daysSince > 14
                    ? `Ultimo evento hace ${daysSince} dias`
                    : `Ultimo evento hace ${daysSince} dias`}
                </div>
              )}
            </>
          )}
        </div>

        <div>
          {demografiaLoading && (
            <div className="flex items-center justify-center py-3" aria-label="Cargando demografía">
              <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
            </div>
          )}
          {!demografiaLoading && demografiaError && (
            <p className="py-2 text-center text-[10px] text-slate-400">
              No se pudo consultar la demografía
            </p>
          )}
          {!demografiaLoading && !demografiaError && demografia && (
            <DemografiaSeccionCard data={demografia} />
          )}
        </div>
      </div>

      <button
        type="button"
        aria-label="Redimensionar panel"
        onPointerDown={startResize}
        className="absolute bottom-0 right-0 z-10 h-5 w-5 cursor-se-resize touch-none bg-gradient-to-tl from-slate-200/90 to-transparent hover:from-slate-300/90"
      />
    </div>
  );
}

function StatCell({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded border px-2 py-1.5 ${
        highlight
          ? "border-emerald-200 bg-emerald-50"
          : "border-transparent bg-slate-50"
      }`}
    >
      <div className={`text-[9px] ${highlight ? "text-emerald-600" : "text-slate-400"}`}>
        {label}
      </div>
      <div
        className={`text-[12px] font-semibold ${
          highlight ? "text-emerald-700" : "text-slate-800"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
