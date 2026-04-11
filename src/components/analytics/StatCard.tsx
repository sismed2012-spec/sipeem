import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
  colorClass?: string;
}

export function StatCard({ title, value, sub, icon: Icon, colorClass = "text-slate-900" }: StatCardProps) {
  return (
    <Card className="border-slate-200 shadow-sm overflow-hidden group hover:shadow-md transition-all">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{title}</p>
            <h3 className={`text-3xl font-black ${colorClass} tracking-tighter`}>{value}</h3>
            {sub && <p className="text-[10px] font-bold text-slate-500 uppercase mt-1 italic tracking-tight">{sub}</p>}
          </div>
          <div className="h-12 w-12 rounded-2xl bg-slate-50 flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner">
            <Icon className="h-6 w-6 text-slate-400" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
