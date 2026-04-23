export default function MapaLoading() {
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-50/50 animate-pulse">
      {/* Header */}
      <div className="p-6 border-b bg-white shadow-sm">
        <div className="h-7 w-64 rounded-xl bg-slate-100" />
        <div className="mt-2 h-3 w-48 rounded-lg bg-slate-50" />
      </div>

      {/* Mapa */}
      <div className="flex-1 flex items-center justify-center bg-slate-100">
        <div className="w-full max-w-4xl h-[600px] rounded-[2rem] bg-white/60 shadow-2xl border border-slate-200 flex flex-col items-center justify-center space-y-4">
          <div className="w-12 h-12 bg-slate-100 rounded-full" />
          <div className="h-4 w-48 bg-slate-100 rounded-full" />
          <div className="h-2 w-32 bg-slate-50 rounded-full" />
        </div>
      </div>
    </div>
  );
}
