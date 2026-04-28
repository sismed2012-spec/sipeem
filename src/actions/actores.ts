"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";
import { logAction } from "@/lib/audit";
import type {
  Termometros,
  Escenarios,
  ComiteMunicipal,
  Planilla,
  Aspirante,
  EventoCampana,
  Incidencia,
  CompromisoCampana,
  CompetenciaMunicipal,
} from "@/lib/types";
import { getEventosMunicipio } from "./agenda";
import { getIncidenciasMunicipio } from "./incidencias";
import { getCompromisosMunicipio } from "./compromisos";
import { getPulsoDigital, type PulsoDigital } from "./pulso-digital";

async function assertAdmin() {
  const usuario = await getUsuarioActual();
  if (!usuario || (usuario.rol !== "director" && usuario.rol !== "admin")) {
    throw new Error("Privilegios insuficientes para acceder al módulo de actores");
  }
  return usuario;
}

export type ActoresMunicipioData = {
  termometros: Termometros | null;
  escenarios: Escenarios | null;
  comite: ComiteMunicipal | null;
  planilla: Planilla[];
  aspirantes: Aspirante[];
  eventos: EventoCampana[];
  incidencias: Incidencia[];
  compromisos: CompromisoCampana[];
  competencia: CompetenciaMunicipal | null;
  pulso: PulsoDigital[];
};

export async function getActoresMunicipio(
  municipioId: number
): Promise<ActoresMunicipioData> {
  await assertAdmin();
  const service = createServiceClient();

  const [
    { data: termometros, error: e1 },
    { data: escenarios, error: e2 },
    { data: comite, error: e3 },
    { data: planilla, error: e4 },
    { data: aspirantes, error: e5 },
  ] = await Promise.all([
    service.from("termometros").select("*").eq("municipio_id", municipioId).maybeSingle(),
    service.from("escenarios").select("*").eq("municipio_id", municipioId).maybeSingle(),
    service.from("comite_municipal").select("*").eq("municipio_id", municipioId).maybeSingle(),
    service.from("planilla").select("*").eq("municipio_id", municipioId).order("cargo"),
    service.from("aspirantes").select("*").eq("municipio_id", municipioId).order("nombre"),
  ]);

  const firstError = e1 ?? e2 ?? e3 ?? e4 ?? e5;
  if (firstError) throw new Error(firstError.message);

  const eventos = await getEventosMunicipio(municipioId).catch(() => []);
  const incidencias = await getIncidenciasMunicipio(municipioId).catch(() => []);
  const compromisos = await getCompromisosMunicipio(municipioId).catch(() => []);
  const pulso = await getPulsoDigital(municipioId).catch(() => []);
  const { data: competenciaData } = await service.from("competencia_municipal").select("*").eq("municipio_id", municipioId).maybeSingle();

  return {
    termometros: termometros as Termometros | null,
    escenarios: escenarios as Escenarios | null,
    comite: comite as ComiteMunicipal | null,
    planilla: (planilla ?? []) as Planilla[],
    aspirantes: (aspirantes ?? []) as Aspirante[],
    eventos,
    incidencias,
    compromisos,
    competencia: competenciaData as CompetenciaMunicipal | null,
    pulso,
  };
}

export async function upsertTermometros(
  municipioId: number,
  data: Omit<Termometros, "id" | "municipio_id">
) {
  await assertAdmin();
  const service = createServiceClient();
  const sanitizeTerm = (value: number | null | undefined): number =>
    Math.min(100, Math.max(0, Math.round(Number(value ?? 0))));
  const normalized = {
    term1: sanitizeTerm(data.term1),
    term2: sanitizeTerm(data.term2),
    term3: sanitizeTerm(data.term3),
    term4: sanitizeTerm(data.term4),
    term5: sanitizeTerm(data.term5),
  };

  const { error } = await service
    .from("termometros")
    .upsert({ municipio_id: municipioId, ...normalized }, { onConflict: "municipio_id" });

  if (error) throw new Error(error.message);
  revalidatePath(`/admin/estrategia-municipal/${municipioId}`);
  await logAction({ action: "upsert", entity: "termometros", entityId: municipioId });
  return { success: true };
}

export async function upsertEscenarios(
  municipioId: number,
  data: Omit<Escenarios, "id" | "municipio_id">
) {
  await assertAdmin();
  const service = createServiceClient();

  const { error } = await service
    .from("escenarios")
    .upsert({ municipio_id: municipioId, ...data }, { onConflict: "municipio_id" });

  if (error) throw new Error(error.message);
  revalidatePath(`/admin/estrategia-municipal/${municipioId}`);
  await logAction({ action: "upsert", entity: "escenarios", entityId: municipioId });
  return { success: true };
}

export async function upsertCompetencia(
  municipioId: number,
  data: Omit<CompetenciaMunicipal, "id" | "municipio_id" | "updated_at">
): Promise<void> {
  await assertAdmin();
  const svc = createServiceClient();
  const { error } = await svc
    .from("competencia_municipal")
    .upsert({ ...data, municipio_id: municipioId, updated_at: new Date().toISOString() }, { onConflict: "municipio_id" });
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/estrategia-municipal/${municipioId}`);
  await logAction({ action: "upsert", entity: "competencia", entityId: municipioId });
}

export async function upsertComite(
  municipioId: number,
  data: Omit<ComiteMunicipal, "id" | "municipio_id">
) {
  await assertAdmin();
  const service = createServiceClient();

  const { error } = await service
    .from("comite_municipal")
    .upsert({ municipio_id: municipioId, ...data }, { onConflict: "municipio_id" });

  if (error) throw new Error(error.message);
  revalidatePath(`/admin/estrategia-municipal/${municipioId}`);
  await logAction({ action: "upsert", entity: "comite", entityId: municipioId });
  return { success: true };
}

export async function createPlanillaMember(
  municipioId: number,
  data: { cargo: string; nombre: string; partido: string }
) {
  await assertAdmin();
  const service = createServiceClient();

  const { error } = await service.from("planilla").insert({
    municipio_id: municipioId,
    cargo: data.cargo.trim(),
    nombre: data.nombre.trim(),
    partido: data.partido.trim(),
    foto_url: null,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/admin/estrategia-municipal/${municipioId}`);
  await logAction({ action: "create", entity: "planilla", entityId: municipioId, details: { nombre: data.nombre, cargo: data.cargo } });
  return { success: true };
}

export async function deletePlanillaMember(id: number, municipioId: number) {
  await assertAdmin();
  const service = createServiceClient();

  const { error } = await service.from("planilla").delete().eq("id", id).eq("municipio_id", municipioId);

  if (error) throw new Error(error.message);
  revalidatePath(`/admin/estrategia-municipal/${municipioId}`);
  await logAction({ action: "delete", entity: "planilla", entityId: id });
  return { success: true };
}

export async function createAspirante(
  municipioId: number,
  data: {
    nombre: string;
    cargo_aspirado: string;
    partido: string;
    fecha_nacimiento: string | null;
    telefono: string | null;
    email: string | null;
    notas: string | null;
  }
) {
  await assertAdmin();
  const service = createServiceClient();

  const { error } = await service.from("aspirantes").insert({
    municipio_id: municipioId,
    nombre: data.nombre.trim(),
    cargo_aspirado: data.cargo_aspirado.trim(),
    partido: data.partido.trim(),
    fecha_nacimiento: data.fecha_nacimiento || null,
    telefono: data.telefono?.trim() || null,
    email: data.email?.trim() || null,
    notas: data.notas?.trim() || null,
    foto_url: null,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/admin/estrategia-municipal/${municipioId}`);
  await logAction({ action: "create", entity: "aspirante", entityId: municipioId, details: { nombre: data.nombre, cargo_aspirado: data.cargo_aspirado } });
  return { success: true };
}

export async function updateAspirante(
  id: number,
  municipioId: number,
  data: {
    nombre: string;
    cargo_aspirado: string;
    partido: string;
    fecha_nacimiento: string | null;
    telefono: string | null;
    email: string | null;
    notas: string | null;
  }
) {
  await assertAdmin();
  const service = createServiceClient();

  const { error } = await service
    .from("aspirantes")
    .update({
      nombre: data.nombre.trim(),
      cargo_aspirado: data.cargo_aspirado.trim(),
      partido: data.partido.trim(),
      fecha_nacimiento: data.fecha_nacimiento || null,
      telefono: data.telefono?.trim() || null,
      email: data.email?.trim() || null,
      notas: data.notas?.trim() || null,
    })
    .eq("id", id)
    .eq("municipio_id", municipioId);

  if (error) throw new Error(error.message);
  revalidatePath(`/admin/estrategia-municipal/${municipioId}`);
  await logAction({ action: "update", entity: "aspirante", entityId: id, details: { nombre: data.nombre, cargo_aspirado: data.cargo_aspirado } });
  return { success: true };
}

export async function deleteAspirante(id: number, municipioId: number) {
  await assertAdmin();
  const service = createServiceClient();

  const { error } = await service.from("aspirantes").delete().eq("id", id).eq("municipio_id", municipioId);

  if (error) throw new Error(error.message);
  revalidatePath(`/admin/estrategia-municipal/${municipioId}`);
  await logAction({ action: "delete", entity: "aspirante", entityId: id });
  return { success: true };
}
