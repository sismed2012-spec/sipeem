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

// ── Popup summary types ───────────────────────────────────────────────────────

export interface EstructuraResumen {
  promotores: number;
  secciones_total: number;
  compromisos: number;
  ultimo_evento: string | null;
}

export interface SeccionDetalle {
  promotor: string | null;
  compromisos: number;
  meta: number;
  ultimo_evento: string | null;
}

// ── Popup summary actions ─────────────────────────────────────────────────────

export async function getEstructuraResumenByMunicipio(
  municipioId: number
): Promise<EstructuraResumen> {
  await assertAdmin();
  const svc = createServiceClient();

  const [
    { count: promotoresCount },
    { count: seccionesCount },
    { count: compromisos },
    { data: ultimoEvento },
  ] = await Promise.all([
    svc
      .from("promotores")
      .select("*", { count: "exact", head: true })
      .eq("municipio_id", municipioId),
    svc
      .from("secciones")
      .select("*", { count: "exact", head: true })
      .eq("municipio_id", municipioId),
    svc
      .from("compromisos_seccion")
      .select("*", { count: "exact", head: true })
      .eq("municipio_id", municipioId),
    svc
      .from("compromisos_seccion")
      .select("fecha")
      .eq("municipio_id", municipioId)
      .order("fecha", { ascending: false })
      .limit(1),
  ]);

  return {
    promotores: promotoresCount ?? 0,
    secciones_total: seccionesCount ?? 0,
    compromisos: compromisos ?? 0,
    ultimo_evento: ultimoEvento?.[0]?.fecha ?? null,
  };
}

export async function getEstructuraBySeccion(
  municipioId: number,
  seccionNumero: number
): Promise<SeccionDetalle> {
  await assertAdmin();
  const svc = createServiceClient();

  const { data: seccion } = await svc
    .from("secciones")
    .select("id, meta, promotores(nombre)")
    .eq("municipio_id", municipioId)
    .eq("numero", seccionNumero)
    .single();

  if (!seccion) {
    return { promotor: null, compromisos: 0, meta: 0, ultimo_evento: null };
  }

  const { count: compromisos, data: ultimoEvento } = await svc
    .from("compromisos_seccion")
    .select("fecha", { count: "exact" })
    .eq("seccion_id", (seccion as any).id)
    .order("fecha", { ascending: false })
    .limit(1);

  return {
    promotor: (seccion as any).promotores?.nombre ?? null,
    compromisos: compromisos ?? 0,
    meta: (seccion as any).meta ?? 0,
    ultimo_evento: ultimoEvento?.[0]?.fecha ?? null,
  };
}

// ── Realtime cobertura ────────────────────────────────────────────────────────

export interface CoberturaSeccion {
  seccion_id: number;
  seccion_numero: number;
  compromisos: number;
  meta: number;
}

export async function getCoberturaByMunicipio(
  municipioId: number
): Promise<CoberturaSeccion[]> {
  await assertAdmin();
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("compromisos_seccion")
    .select("seccion_id, compromisos, meta, secciones!inner(numero)")
    .eq("municipio_id", municipioId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => ({
    seccion_id: row.seccion_id,
    seccion_numero: row.secciones.numero,
    compromisos: row.compromisos,
    meta: row.meta,
  }));
}
