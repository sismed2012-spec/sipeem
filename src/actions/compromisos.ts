"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";
import { redirect } from "next/navigation";
import type { CompromisoCampana } from "@/lib/types";

async function assertAdmin() {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) redirect("/login");
}

export async function getCompromisosMunicipio(municipioId: number): Promise<CompromisoCampana[]> {
  await assertAdmin();
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("compromisos_campana")
    .select("*")
    .eq("municipio_id", municipioId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CompromisoCampana[];
}

export async function createCompromiso(
  municipioId: number,
  data: Omit<CompromisoCampana, "id" | "municipio_id" | "created_at">
): Promise<void> {
  await assertAdmin();
  const svc = createServiceClient();
  const { error } = await svc.from("compromisos_campana").insert({ ...data, municipio_id: municipioId });
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/estrategia-municipal/${municipioId}`);
}

export async function updateCompromisoEstatus(
  id: number,
  municipioId: number,
  estatus: CompromisoCampana["estatus"],
  fecha_cumplimiento?: string | null
): Promise<void> {
  await assertAdmin();
  const svc = createServiceClient();
  const update: Record<string, unknown> = { estatus };
  if (fecha_cumplimiento !== undefined) update.fecha_cumplimiento = fecha_cumplimiento;
  const { error } = await svc
    .from("compromisos_campana")
    .update(update)
    .eq("id", id)
    .eq("municipio_id", municipioId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/estrategia-municipal/${municipioId}`);
}

export async function deleteCompromiso(id: number, municipioId: number): Promise<void> {
  await assertAdmin();
  const svc = createServiceClient();
  const { error } = await svc
    .from("compromisos_campana")
    .delete()
    .eq("id", id)
    .eq("municipio_id", municipioId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/estrategia-municipal/${municipioId}`);
}
