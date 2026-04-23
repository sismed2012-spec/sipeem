"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";
import { redirect } from "next/navigation";
import type { SeccionElectoral, Promotor, CompromisoSeccion } from "@/lib/types";

async function assertAdmin() {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) redirect("/login");
}

function revalidate(municipioId: number) {
  revalidatePath(`/admin/estructura/${municipioId}`);
}

export async function getEstructuraMunicipio(municipioId: number): Promise<{
  secciones: SeccionElectoral[];
  promotores: Promotor[];
  compromisos: CompromisoSeccion[];
}> {
  await assertAdmin();
  const svc = createServiceClient();

  const [
    { data: secciones, error: e1 },
    { data: promotores, error: e2 },
    { data: compromisos, error: e3 },
  ] = await Promise.all([
    svc.from("secciones").select("*").eq("municipio_id", municipioId).order("numero"),
    svc.from("promotores").select("*").eq("municipio_id", municipioId).order("nombre"),
    svc.from("compromisos_seccion").select("*").eq("municipio_id", municipioId).order("fecha", { ascending: false }),
  ]);

  if (e1 ?? e2 ?? e3) throw new Error((e1 ?? e2 ?? e3)!.message);

  return {
    secciones: (secciones ?? []) as SeccionElectoral[],
    promotores: (promotores ?? []) as Promotor[],
    compromisos: (compromisos ?? []) as CompromisoSeccion[],
  };
}

export async function createSeccion(
  municipioId: number,
  data: Omit<SeccionElectoral, "id" | "municipio_id">
): Promise<void> {
  await assertAdmin();
  const svc = createServiceClient();
  const { error } = await svc.from("secciones").insert({ ...data, municipio_id: municipioId });
  if (error) throw new Error(error.message);
  revalidate(municipioId);
}

export async function deleteSeccion(id: number, municipioId: number): Promise<void> {
  await assertAdmin();
  const svc = createServiceClient();
  const { error } = await svc.from("secciones").delete().eq("id", id).eq("municipio_id", municipioId);
  if (error) throw new Error(error.message);
  revalidate(municipioId);
}

export async function createPromotor(
  municipioId: number,
  data: Omit<Promotor, "id" | "municipio_id" | "created_at">
): Promise<void> {
  await assertAdmin();
  const svc = createServiceClient();
  const { error } = await svc.from("promotores").insert({ ...data, municipio_id: municipioId });
  if (error) throw new Error(error.message);
  revalidate(municipioId);
}

export async function updatePromotor(
  id: number,
  municipioId: number,
  data: Partial<Omit<Promotor, "id" | "municipio_id" | "created_at">>
): Promise<void> {
  await assertAdmin();
  const svc = createServiceClient();
  const { error } = await svc.from("promotores").update(data).eq("id", id).eq("municipio_id", municipioId);
  if (error) throw new Error(error.message);
  revalidate(municipioId);
}

export async function deletePromotor(id: number, municipioId: number): Promise<void> {
  await assertAdmin();
  const svc = createServiceClient();
  const { error } = await svc.from("promotores").delete().eq("id", id).eq("municipio_id", municipioId);
  if (error) throw new Error(error.message);
  revalidate(municipioId);
}

export async function upsertCompromisoSeccion(
  municipioId: number,
  seccionId: number,
  compromisos: number,
  meta: number
): Promise<void> {
  await assertAdmin();
  const svc = createServiceClient();
  const fecha = new Date().toISOString().slice(0, 10);
  const { error } = await svc
    .from("compromisos_seccion")
    .upsert(
      { municipio_id: municipioId, seccion_id: seccionId, compromisos, meta, fecha },
      { onConflict: "municipio_id,seccion_id,fecha" }
    );
  if (error) throw new Error(error.message);
  revalidate(municipioId);
}
