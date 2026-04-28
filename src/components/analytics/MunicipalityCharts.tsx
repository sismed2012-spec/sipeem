"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

import type { MunicipioTimelineEvent } from "@/lib/municipio-analytics";

type TimelineChartPoint = Pick<
  MunicipioTimelineEvent,
  "anio" | "electionType" | "source"
>;

function formatElectionLabel(event: TimelineChartPoint) {
  if (event.electionType === "gubernatura") {
    return `${event.anio} Gub.`;
  }

  if (event.source === "legacy_municipal") {
    return `${event.anio} Leg.`;
  }

  return String(event.anio);
}

type MunicipioHistoryPoint = TimelineChartPoint & {
  votos: number;
};

export function MunicipioHistoryChart({ data }: { data: MunicipioHistoryPoint[] }) {
  if (!data?.length)
    return (
      <div className="h-40 flex items-center justify-center text-slate-400 text-xs italic">
        Sin datos disponibles
      </div>
    );

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data.map((entry) => ({
            ...entry,
            label: formatElectionLabel(entry),
          }))}
          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
        >
          <defs>
            <linearGradient id="colorVotes" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#0f172a" stopOpacity={0.1} />
              <stop offset="95%" stopColor="#0f172a" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }}
          />
          <Tooltip
            contentStyle={{
              borderRadius: "12px",
              border: "none",
              boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
            }}
            labelStyle={{ fontWeight: 900, marginBottom: "4px" }}
          />
          <Area
            type="monotone"
            dataKey="votos"
            stroke="#0f172a"
            strokeWidth={3}
            fillOpacity={1}
            fill="url(#colorVotes)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

type MultiPartyPoint = {
  anio: TimelineChartPoint["anio"];
  electionType: TimelineChartPoint["electionType"];
  source: TimelineChartPoint["source"];
  topParties: { siglas: string; votes: number; color: string }[];
};

export function MunicipioMultiPartyChart({ data }: { data: MultiPartyPoint[] }) {
  if (!data?.length)
    return (
      <div className="h-40 flex items-center justify-center text-slate-400 text-xs italic">
        Sin datos disponibles
      </div>
    );

  // Collect unique party siglas and their colors (first occurrence wins)
  const colorMap = new Map<string, string>();
  data.forEach((entry) =>
    entry.topParties.forEach((p) => {
      if (!colorMap.has(p.siglas)) colorMap.set(p.siglas, p.color);
    })
  );
  const allSiglas = Array.from(colorMap.keys());

  // Build chart data in chronological order (data arrives newest-first)
  const chartData = [...data].reverse().map((entry) => {
    const row: Record<string, number | string> = {
      label: formatElectionLabel(entry),
    };
    allSiglas.forEach((s) => {
      row[s] = 0;
    });
    entry.topParties.forEach((p) => {
      row[p.siglas] = p.votes;
    });
    return row;
  });

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }}
          />
          <Tooltip
            contentStyle={{
              borderRadius: "12px",
              border: "none",
              boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
            }}
            labelStyle={{ fontWeight: 900, marginBottom: "4px" }}
            formatter={(value: unknown, name: unknown) => [
              typeof value === "number" ? value.toLocaleString() : String(value ?? ""),
              String(name ?? ""),
            ]}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 10, fontWeight: 700, paddingTop: 12 }}
          />
          {allSiglas.map((siglas) => (
            <Bar
              key={siglas}
              dataKey={siglas}
              fill={colorMap.get(siglas) ?? "#94a3b8"}
              radius={[3, 3, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

type MarginPoint = {
  anio: TimelineChartPoint["anio"];
  electionType: TimelineChartPoint["electionType"];
  source: TimelineChartPoint["source"];
  margin: number;
  porcentaje: number;
};

export function MunicipioMarginChart({ data }: { data: MarginPoint[] }) {
  if (!data?.length)
    return (
      <div className="h-32 flex items-center justify-center text-slate-400 text-xs italic">
        Sin datos disponibles
      </div>
    );

  const chartData = [...data].reverse().map((entry) => ({
    label: formatElectionLabel(entry),
    margen: entry.margin,
    pct: Number(entry.porcentaje.toFixed(1)),
  }));

  const avgMargin = Math.round(
    chartData.reduce((sum, d) => sum + d.margen, 0) / chartData.length
  );

  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }}
          />
          <Tooltip
            contentStyle={{
              borderRadius: "12px",
              border: "none",
              boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
            }}
            labelStyle={{ fontWeight: 900, marginBottom: "4px" }}
            formatter={(value: unknown, name: unknown) => {
              const n = typeof value === "number" ? value : Number(value ?? 0);
              const key = String(name ?? "");
              return [
                key === "margen" ? n.toLocaleString() + " v." : n + "%",
                key === "margen" ? "Margen votos" : "% ganador",
              ];
            }}
          />
          <ReferenceLine
            y={avgMargin}
            stroke="#cbd5e1"
            strokeDasharray="4 2"
            label={{
              value: "Prom.",
              position: "insideTopRight",
              fontSize: 9,
              fontWeight: 700,
              fill: "#94a3b8",
            }}
          />
          <Line
            type="monotone"
            dataKey="margen"
            stroke="#ef4444"
            strokeWidth={2.5}
            dot={{ fill: "#ef4444", r: 4, strokeWidth: 0 }}
            activeDot={{ r: 6 }}
            name="margen"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
