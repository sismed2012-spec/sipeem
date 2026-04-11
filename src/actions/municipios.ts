"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";
import { Municipio } from "@/lib/types";

/**
 * Ensures only authorized personnel (director/admin) can access these actions.
 */
async function assertAdmin() {
  const admin = await getUsuarioActual();
  const allowedRoles = ["director", "admin"];
  
  if (!admin || !allowedRoles.includes(admin.rol)) {
    throw new Error("Acceso denegado: se requieren privilegios directivos o administrativos");
  }
}

export async function getMunicipios(searchQuery?: string) {
  await assertAdmin();
  const service = createServiceClient();
  
  let query = service.from("municipios").select("*").order("nombre");
  
  if (searchQuery) {
    query = query.ilike("nombre", `%${searchQuery}%`);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);
  return data as Municipio[];
}

export async function getMunicipioById(id: string | number) {
  await assertAdmin();
  const service = createServiceClient();
  const { data, error } = await service
    .from("municipios")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);
  return data as Municipio;
}

export async function createMunicipio(data: { 
  nombre: string; 
  distrito: string; 
  region: string; 
  estatus: "activo" | "inactivo" 
}) {
  await assertAdmin();

  if (!data.nombre.trim()) throw new Error("El nombre es obligatorio");

  const service = createServiceClient();

  // Explicit status validation
  if (!["activo", "inactivo"].includes(data.estatus)) {
    throw new Error("Estatus inválido");
  }

  const { error } = await service.from("municipios").insert({
    nombre: data.nombre.trim(),
    distrito: data.distrito.trim() || null,
    region: data.region.trim() || null,
    estatus: data.estatus,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/admin/catalogos/municipios");
  return { success: true };
}

export async function updateMunicipio(id: string | number, data: { 
  nombre: string; 
  distrito: string; 
  region: string; 
  estatus: "activo" | "inactivo" 
}) {
  await assertAdmin();

  if (!data.nombre.trim()) throw new Error("El nombre es obligatorio");

  const service = createServiceClient();

  // Explicit status validation
  if (!["activo", "inactivo"].includes(data.estatus)) {
    throw new Error("Estatus inválido");
  }

  const { error } = await service
    .from("municipios")
    .update({
      nombre: data.nombre.trim(),
      distrito: data.distrito.trim() || null,
      region: data.region.trim() || null,
      estatus: data.estatus,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/admin/catalogos/municipios");
  revalidatePath(`/admin/catalogos/municipios/${id}`);
  return { success: true };
}
