import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type PaginationBarProps = {
  page: number;
  totalPages: number;
  totalRecords: number;
  pageSize: number;
  basePath: string;
  /** Existing searchParams to preserve across page navigation */
  searchParams?: Record<string, string | string[] | undefined>;
};

function buildPageUrl(
  basePath: string,
  targetPage: number,
  searchParams: Record<string, string | string[] | undefined>
): string {
  const params = new URLSearchParams();
  Object.entries(searchParams).forEach(([key, value]) => {
    if (key === "page") return;
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
  });
  params.set("page", String(targetPage));
  return `${basePath}?${params.toString()}`;
}

export function PaginationBar({
  page,
  totalPages,
  totalRecords,
  pageSize,
  basePath,
  searchParams = {},
}: PaginationBarProps) {
  if (totalPages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalRecords);
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-4">
      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
        {from.toLocaleString()}–{to.toLocaleString()} de{" "}
        {totalRecords.toLocaleString()} registros
      </p>

      <div className="flex items-center gap-2">
        {hasPrev ? (
          <Link href={buildPageUrl(basePath, page - 1, searchParams)}>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-slate-200 font-bold"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl border-slate-200 font-bold opacity-30"
            disabled
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}

        <span className="px-3 text-xs font-black text-slate-600">
          {page} / {totalPages}
        </span>

        {hasNext ? (
          <Link href={buildPageUrl(basePath, page + 1, searchParams)}>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-slate-200 font-bold"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl border-slate-200 font-bold opacity-30"
            disabled
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
