"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";
import { redirect } from "next/navigation";
import type { SeccionElectoral, CompromisoSeccion } from "@/lib/types";

async function assertAutenticado() {
  const usuario = await getUsuarioActual();
  if (!usuario) redirect("/login");
  return usuario;
}

export async function getSeccionesMunicipioCampo(municipioId: number): Promise<{
  secciones: SeccionElectoral[];
  compromisos: CompromisoSeccion[];
}> {
  await assertAutenticado();
  const svc = createServiceClient();

  const [secRes, compRes] = await Promise.all([
    svc.from("secciones").select("*").eq("municipio_id", municipioId).order("numero"),
    svc
      .from("compromisos_seccion")
      .select("*")
      .eq("municipio_id", municipioId)
      .order("fecha", { ascending: false }),
  ]);

  return {
    secciones: (secRes.data ?? []) as SeccionElectoral[],
    compromisos: (compRes.data ?? []) as CompromisoSeccion[],
  };
}

export async function registrarCompromisoCampo(
  municipioId: number,
  seccionId: number,
  compromisos: number,
  meta: number
): Promise<void> {
  await assertAutenticado();
  const svc = createServiceClient();
  const fecha = new Date().toISOString().slice(0, 10);
  const { error } = await svc
    .from("compromisos_seccion")
    .upsert(
      { municipio_id: municipioId, seccion_id: seccionId, compromisos, meta, fecha },
      { onConflict: "municipio_id,seccion_id,fecha" }
    );
  if (error) throw new Error(error.message);
  revalidatePath(`/campo/secciones/${municipioId}`);
}

export async function crearIncidenciaCampo(
  municipioId: number,
  data: {
    tipo: "violencia" | "acarreo" | "compra_voto" | "propaganda_ilegal" | "otro";
    descripcion: string;
    severidad: "baja" | "media" | "alta" | "critica";
  }
): Promise<void> {
  const usuario = await assertAutenticado();
  const svc = createServiceClient();
  const { error } = await svc.from("incidencias").insert({
    municipio_id: municipioId,
    tipo: data.tipo,
    descripcion: data.descripcion,
    severidad: data.severidad,
    estatus: "abierta",
    fecha: new Date().toISOString().slice(0, 10),
    reportado_por: usuario.nombre,
    notas: null,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/campo/incidencias/${municipioId}`);
}
