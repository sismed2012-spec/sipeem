// src/actions/incidencias.ts
"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";
import { redirect } from "next/navigation";
import type { Incidencia } from "@/lib/types";

async function assertAdmin() {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) redirect("/login");
}

export async function getIncidenciasMunicipio(municipioId: number): Promise<Incidencia[]> {
  await assertAdmin();
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("incidencias")
    .select("*")
    .eq("municipio_id", municipioId)
    .order("fecha", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Incidencia[];
}

export async function createIncidencia(
  municipioId: number,
  data: Omit<Incidencia, "id" | "municipio_id" | "created_at">
): Promise<void> {
  await assertAdmin();
  const svc = createServiceClient();
  const { error } = await svc.from("incidencias").insert({ ...data, municipio_id: municipioId });
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/estrategia-municipal/${municipioId}`);
}

export async function updateIncidenciaEstatus(
  id: number,
  municipioId: number,
  estatus: Incidencia["estatus"]
): Promise<void> {
  await assertAdmin();
  const svc = createServiceClient();
  const { error } = await svc
    .from("incidencias")
    .update({ estatus })
    .eq("id", id)
    .eq("municipio_id", municipioId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/estrategia-municipal/${municipioId}`);
}

export async function deleteIncidencia(id: number, municipioId: number): Promise<void> {
  await assertAdmin();
  const svc = createServiceClient();
  const { error } = await svc
    .from("incidencias")
    .delete()
    .eq("id", id)
    .eq("municipio_id", municipioId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/estrategia-municipal/${municipioId}`);
}
