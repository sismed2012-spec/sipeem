import { getUsuarioActual } from "@/actions/auth";
import { getMunicipios } from "@/actions/municipios";
import Link from "next/link";
import { AlertTriangle, Users } from "lucide-react";

export default async function CampoPage() {
  const [usuario, municipios] = await Promise.all([
    getUsuarioActual(),
    getMunicipios(),
  ]);

  const misMunicipios =
    usuario?.rol === "operador"
      ? municipios.filter((m) => usuario.municipios_asignados?.includes(m.id))
      : municipios.slice(0, 10);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-black text-slate-900">Mis municipios</h1>

      {misMunicipios.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">
          No tienes municipios asignados. Contacta a tu administrador.
        </p>
      ) : (
        <div className="space-y-2">
          {misMunicipios.map((m) => (
            <div key={m.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: m.color || "#94a3b8" }}
                />
                <h2 className="font-bold text-slate-900">{m.nombre}</h2>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Link
                  href={`/campo/secciones/${m.id}`}
                  className="flex items-center gap-2 p-3 rounded-xl bg-indigo-50 text-indigo-700 text-sm font-semibold"
                >
                  <Users className="w-4 h-4" /> Compromisos
                </Link>
                <Link
                  href={`/campo/incidencias/${m.id}`}
                  className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 text-rose-700 text-sm font-semibold"
                >
                  <AlertTriangle className="w-4 h-4" /> Incidencias
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
