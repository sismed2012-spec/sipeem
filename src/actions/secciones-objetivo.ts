"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";

async function assertAdmin() {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) {
    throw new Error("Privilegios insuficientes");
  }
  return usuario;
}

export async function upsertSeccionObjetivo(input: {
  municipioId: number;
  seccionNumero: number;
  prioridad: "Baja" | "Media" | "Alta" | "Critica";
  scoreSnapshot: number;
  anio: number | null;
}) {
  const usuario = await assertAdmin();
  const service = createServiceClient();

  const { data: seccion, error: seccionError } = await service
    .from("secciones")
    .select("id")
    .eq("municipio_id", input.municipioId)
    .eq("numero", input.seccionNumero)
    .single();

  if (seccionError || !seccion) {
    throw new Error("No existe la sección en estructura");
  }

  const { error } = await service.from("secciones_objetivo").upsert(
    {
      municipio_id: input.municipioId,
      seccion_id: seccion.id,
      prioridad: input.prioridad,
      score_snapshot: input.scoreSnapshot,
      source: "historial_prioridad",
      anio: input.anio,
      estatus: "Pendiente",
      updated_by: usuario.id,
    },
    { onConflict: "municipio_id,seccion_id" }
  );

  if (error) throw new Error(error.message);

  revalidatePath(`/admin/historial/municipio/${input.municipioId}`);
  revalidatePath(`/admin/estructura/${input.municipioId}`);
  revalidatePath(`/campo/secciones/${input.municipioId}`);
  revalidatePath("/admin/historial/dashboard");
}

export async function deleteSeccionObjetivo(input: {
  municipioId: number;
  seccionNumero: number;
}) {
  await assertAdmin();
  const service = createServiceClient();

  const { data: seccion, error: seccionError } = await service
    .from("secciones")
    .select("id")
    .eq("municipio_id", input.municipioId)
    .eq("numero", input.seccionNumero)
    .single();

  if (seccionError || !seccion) {
    throw new Error("No existe la sección en estructura");
  }

  const { error } = await service
    .from("secciones_objetivo")
    .delete()
    .eq("municipio_id", input.municipioId)
    .eq("seccion_id", seccion.id);

  if (error) throw new Error(error.message);

  revalidatePath(`/admin/historial/municipio/${input.municipioId}`);
  revalidatePath(`/admin/estructura/${input.municipioId}`);
  revalidatePath(`/campo/secciones/${input.municipioId}`);
  revalidatePath("/admin/historial/dashboard");
}

export async function updateSeccionObjetivoStatus(input: {
  objetivoId: number;
  municipioId: number;
  estatus: "Pendiente" | "En seguimiento" | "Atendida" | "Descartada";
}) {
  const usuario = await assertAdmin();
  const service = createServiceClient();

  const { error } = await service
    .from("secciones_objetivo")
    .update({
      estatus: input.estatus,
      updated_by: usuario.id,
    })
    .eq("id", input.objetivoId)
    .eq("municipio_id", input.municipioId);

  if (error) throw new Error(error.message);

  revalidatePath(`/admin/historial/municipio/${input.municipioId}`);
  revalidatePath(`/admin/estructura/${input.municipioId}`);
  revalidatePath(`/campo/secciones/${input.municipioId}`);
  revalidatePath("/admin/historial/dashboard");
}
