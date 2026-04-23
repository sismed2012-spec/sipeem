// src/actions/agenda.ts
"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";
import { redirect } from "next/navigation";
import type { EventoCampana } from "@/lib/types";

async function assertAdmin() {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) redirect("/login");
}

export async function getEventosMunicipio(municipioId: number): Promise<EventoCampana[]> {
  await assertAdmin();
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("eventos_campana")
    .select("*")
    .eq("municipio_id", municipioId)
    .order("fecha", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as EventoCampana[];
}

export async function createEvento(
  municipioId: number,
  data: Omit<EventoCampana, "id" | "municipio_id" | "created_at">
): Promise<void> {
  await assertAdmin();
  const svc = createServiceClient();
  const { error } = await svc.from("eventos_campana").insert({ ...data, municipio_id: municipioId });
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/estrategia-municipal/${municipioId}`);
}

export async function deleteEvento(id: number, municipioId: number): Promise<void> {
  await assertAdmin();
  const svc = createServiceClient();
  const { error } = await svc
    .from("eventos_campana")
    .delete()
    .eq("id", id)
    .eq("municipio_id", municipioId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/estrategia-municipal/${municipioId}`);
}
