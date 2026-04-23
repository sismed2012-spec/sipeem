import Link from "next/link";
import { getUsuarioActual } from "@/actions/auth";
import { redirect } from "next/navigation";
import {
  Gauge,
  Map as MapIcon,
  Users,
  BookOpen,
  ShieldCheck,
  Upload,
  Settings,
  Key,
  Brain,
  Smartphone,
  Activity,
  BarChart3,
} from "lucide-react";

type CardProps = {
  href: string;
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  color: string;
  badge?: string;
};

function ModuleCard({ href, icon, iconBg, title, description, color, badge }: CardProps) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-slate-300 transition-all flex flex-col"
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${iconBg}`}>
          {icon}
        </div>
        {badge && (
          <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600">
            {badge}
          </span>
        )}
      </div>
      <h2 className="text-base font-bold text-slate-900 group-hover:text-slate-700">{title}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-500 flex-1">{description}</p>
      <div className="mt-4">
        <span className={`inline-flex rounded-lg px-3 py-1.5 text-xs font-bold text-white ${color}`}>
          Abrir →
        </span>
      </div>
    </Link>
  );
}

export default async function AdminPage() {
  const usuario = await getUsuarioActual();
  if (!usuario) redirect("/login");
  if (usuario.rol === "operador") redirect("/mapa");

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 to-slate-700 p-6 text-white shadow-lg">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-300">
          Administración
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Panel Administrativo</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-300">
          Centro de control del Sistema de Inteligencia Político-Electoral Municipal.
          125 municipios · Estado de México.
        </p>
      </div>

      {/* Operaciones */}
      <section className="space-y-3">
        <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em]">
          Operaciones
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ModuleCard
            href="/admin/situacion"
            icon={<Gauge className="h-6 w-6 text-purple-700" />}
            iconBg="bg-purple-100"
            title="Sala de Situación"
            description="Vista ejecutiva de todos los municipios: prioridad, riesgo, termómetros, proyección y actores."
            color="bg-purple-600 hover:bg-purple-700"
          />
          <ModuleCard
            href="/admin/estrategia-municipal"
            icon={<MapIcon className="h-6 w-6 text-indigo-700" />}
            iconBg="bg-indigo-100"
            title="Estrategia Municipal"
            description="Fichas tácticas completas con actores, aspirantes, agenda, compromisos, competencia y asistente IA."
            color="bg-indigo-600 hover:bg-indigo-700"
          />
          <ModuleCard
            href="/campo"
            icon={<Smartphone className="h-6 w-6 text-emerald-700" />}
            iconBg="bg-emerald-100"
            title="Modo Campo"
            description="Interfaz móvil optimizada para operadores: captura de compromisos por sección y reporte de incidencias."
            color="bg-emerald-600 hover:bg-emerald-700"
            badge="PWA"
          />
        </div>
      </section>

      {/* Inteligencia */}
      <section className="space-y-3">
        <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em]">
          Inteligencia Electoral
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ModuleCard
            href="/admin/historial"
            icon={<BookOpen className="h-6 w-6 text-rose-700" />}
            iconBg="bg-rose-100"
            title="Historial Electoral"
            description="Resultados históricos por municipio, análisis de tendencias, competitividad y auditoría de datos."
            color="bg-rose-600 hover:bg-rose-700"
          />
          <ModuleCard
            href="/admin/historial/dashboard"
            icon={<BarChart3 className="h-6 w-6 text-orange-700" />}
            iconBg="bg-orange-100"
            title="Inteligencia Política"
            description="Dashboard analítico: victorias por partido, alternancia, competitividad crítica y detección de anomalías IA."
            color="bg-orange-600 hover:bg-orange-700"
            badge="IA"
          />
          <ModuleCard
            href="/admin/situacion"
            icon={<Activity className="h-6 w-6 text-blue-700" />}
            iconBg="bg-blue-100"
            title="Proyección ML"
            description="Score combinado de proyección electoral con regresión lineal sobre historial + termómetros por municipio."
            color="bg-blue-600 hover:bg-blue-700"
            badge="ML"
          />
        </div>
      </section>

      {/* Configuración */}
      <section className="space-y-3">
        <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em]">
          Sistema
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ModuleCard
            href="/admin/usuarios"
            icon={<Users className="h-6 w-6 text-blue-700" />}
            iconBg="bg-blue-100"
            title="Usuarios y Roles"
            description="Gestión de cuentas, asignación de municipios y permisos por rol: operador, admin, director."
            color="bg-blue-600 hover:bg-blue-700"
          />
          <ModuleCard
            href="/admin/catalogos"
            icon={<Settings className="h-6 w-6 text-violet-700" />}
            iconBg="bg-violet-100"
            title="Catálogos Base"
            description="Municipios, partidos políticos y parámetros de configuración del sistema."
            color="bg-violet-600 hover:bg-violet-700"
          />
          <ModuleCard
            href="/admin/importacion"
            icon={<Upload className="h-6 w-6 text-cyan-700" />}
            iconBg="bg-cyan-100"
            title="Importación Electoral"
            description="Carga y validación de historiales electorales mediante archivos CSV con vista previa."
            color="bg-cyan-600 hover:bg-cyan-700"
          />
          <ModuleCard
            href="/admin/auditoria"
            icon={<ShieldCheck className="h-6 w-6 text-amber-700" />}
            iconBg="bg-amber-100"
            title="Auditoría"
            description="Registro completo de todas las acciones administrativas: quién hizo qué y cuándo."
            color="bg-amber-600 hover:bg-amber-700"
          />
          <ModuleCard
            href="/admin/api-keys"
            icon={<Key className="h-6 w-6 text-violet-700" />}
            iconBg="bg-violet-100"
            title="API Keys"
            description="Gestión de claves para la API pública REST. Endpoints de municipios e historial electoral."
            color="bg-violet-600 hover:bg-violet-700"
            badge="API"
          />
          <ModuleCard
            href="/admin/historial/dashboard"
            icon={<Brain className="h-6 w-6 text-indigo-700" />}
            iconBg="bg-indigo-100"
            title="IA Electoral"
            description="Módulos de inteligencia artificial: briefings, asistente municipal, anomalías y perfilado de aspirantes."
            color="bg-indigo-600 hover:bg-indigo-700"
            badge="IA"
          />
        </div>
      </section>
    </div>
  );
}
