"use client";

import { useState } from "react";
import { crearApiKey, revocarApiKey, type ApiKey } from "@/actions/api-keys";
import { toast } from "sonner";
import { Copy, Plus, Trash2, CheckCircle, XCircle } from "lucide-react";

export default function ApiKeysManager({ initialKeys }: { initialKeys: ApiKey[] }) {
  const [keys, setKeys] = useState(initialKeys);
  const [nombre, setNombre] = useState("");
  const [creando, setCreando] = useState(false);
  const [nuevaKey, setNuevaKey] = useState<string | null>(null);
  const [revocando, setRevocando] = useState<number | null>(null);

  async function handleCrear() {
    if (!nombre.trim()) return;
    setCreando(true);
    try {
      const { key, registro } = await crearApiKey(nombre);
      setKeys([registro, ...keys]);
      setNuevaKey(key);
      setNombre("");
      toast.success("API key creada. Copia la key ahora — no se mostrará de nuevo.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear key");
    } finally {
      setCreando(false);
    }
  }

  async function handleRevocar(id: number) {
    setRevocando(id);
    try {
      await revocarApiKey(id);
      setKeys(keys.map((k) => (k.id === id ? { ...k, activa: false } : k)));
      toast.success("API key revocada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al revocar");
    } finally {
      setRevocando(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Nueva key — mostrar UNA vez */}
      {nuevaKey && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
          <p className="text-sm font-bold text-emerald-800">
            API Key creada. Copia ahora — no se mostrará nuevamente.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-white border border-emerald-200 rounded-lg px-3 py-2 text-emerald-900 break-all">
              {nuevaKey}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(nuevaKey);
                toast.success("Copiado");
              }}
              className="p-2 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-700 transition-colors"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={() => setNuevaKey(null)}
            className="text-xs text-emerald-600 hover:text-emerald-800 underline"
          >
            Ya copié la key, cerrar
          </button>
        </div>
      )}

      {/* Formulario de creación */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 flex gap-3">
        <input
          type="text"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCrear()}
          placeholder="Nombre descriptivo (ej: Sistema de medios)"
          className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          onClick={handleCrear}
          disabled={creando || !nombre.trim()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50 hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {creando ? "Creando..." : "Crear key"}
        </button>
      </div>

      {/* Lista de keys */}
      <div className="space-y-2">
        {keys.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-8">No hay API keys creadas.</p>
        )}
        {keys.map((k) => (
          <div
            key={k.id}
            className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center gap-4"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {k.activa ? (
                  <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-slate-300 flex-shrink-0" />
                )}
                <span className="font-semibold text-slate-900 text-sm">{k.nombre}</span>
                {!k.activa && (
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                    Revocada
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
                <span>
                  Prefijo:{" "}
                  <code className="font-mono text-slate-600">{k.key_prefix}…</code>
                </span>
                <span>Usos: {k.usos_totales.toLocaleString("es-MX")}</span>
                {k.ultimo_uso && (
                  <span>
                    Último uso:{" "}
                    {new Date(k.ultimo_uso).toLocaleDateString("es-MX")}
                  </span>
                )}
                <span>
                  Creada por: {k.creada_por}
                </span>
              </div>
            </div>
            {k.activa && (
              <button
                onClick={() => handleRevocar(k.id)}
                disabled={revocando === k.id}
                className="p-2 rounded-xl text-rose-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50 transition-colors flex-shrink-0"
                title="Revocar key"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Documentación rápida */}
      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3">
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Uso de la API</h3>
        <div className="space-y-2 text-xs text-slate-600">
          <p className="text-slate-400">Incluye el header en cada petición:</p>
          <code className="block bg-white border border-slate-200 rounded-lg px-3 py-2 font-mono">
            X-API-Key: sk_sipeem_...
          </code>
          <p className="text-slate-400 mt-2">Endpoints disponibles:</p>
          <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 font-mono space-y-1">
            <div>GET /api/v1/municipios</div>
            <div>GET /api/v1/municipios/[id]</div>
            <div>GET /api/v1/historial?municipio_id=1&amp;anio=2021</div>
          </div>
        </div>
      </div>
    </div>
  );
}
