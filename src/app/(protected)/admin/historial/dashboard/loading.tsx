export default function DashboardLoading() {
  return (
    <div className="space-y-8 animate-pulse max-w-7xl mx-auto pb-12">
      {/* Título */}
      <div className="space-y-2">
        <div className="h-10 w-80 rounded-xl bg-slate-100" />
        <div className="h-4 w-96 rounded-lg bg-slate-50" />
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 rounded-2xl bg-slate-100" />
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 h-72 rounded-2xl bg-slate-100" />
        <div className="h-72 rounded-2xl bg-slate-100" />
      </div>

      {/* Tables */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-64 rounded-2xl bg-slate-100" />
        <div className="h-64 rounded-2xl bg-slate-100" />
      </div>

      {/* Audit card */}
      <div className="h-48 rounded-2xl bg-slate-100" />
    </div>
  );
}
