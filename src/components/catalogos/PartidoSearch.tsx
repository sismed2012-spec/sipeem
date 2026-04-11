"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { useTransition } from "react";

export default function PartidoSearch({ defaultValue = "" }: { defaultValue?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function handleSearch(term: string) {
    const params = new URLSearchParams(searchParams);
    if (term) {
      params.set("q", term);
    } else {
      params.delete("q");
    }

    startTransition(() => {
      router.push(`/admin/catalogos/partidos?${params.toString()}`);
    });
  }

  return (
    <div className="relative w-full md:w-96 group">
      <Input
        key={defaultValue}
        defaultValue={defaultValue}
        placeholder="Buscar por nombre o siglas..."
        onChange={(e) => handleSearch(e.target.value)}
        className={`rounded-xl border-slate-200 transition-all focus:ring-2 focus:ring-slate-900/5 ${
          isPending ? "opacity-50" : ""
        }`}
      />
      {isPending && (
        <div className="absolute right-3 top-3 h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
      )}
    </div>
  );
}
