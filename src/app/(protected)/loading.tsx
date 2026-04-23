export default function ProtectedLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Título */}
      <div className="space-y-2">
        <div className="h-9 w-72 rounded-xl bg-slate-100" />
        <div className="h-4 w-48 rounded-lg bg-slate-50" />
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-2xl bg-slate-100" />
        ))}
      </div>

      {/* Tabla / contenido principal */}
      <div className="h-[420px] rounded-2xl bg-slate-100" />
    </div>
  );
}
