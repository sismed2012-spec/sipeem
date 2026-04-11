"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";
import { Partido } from "@/lib/types";

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

/**
 * Strictly validates a HEX color format (#RRGGBB).
 */
function validateHexColor(color: string) {
  const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
  if (!hexRegex.test(color)) {
    throw new Error("Formato de color hexadecimal inválido (debe ser #RRGGBB)");
  }
}

export async function getPartidos(searchQuery?: string) {
  const admin = await getUsuarioActual();
  if (!admin) throw new Error("No autenticado");
  
  const service = createServiceClient();
  let query = service.from("partidos").select("*").order("nombre");
  
  if (searchQuery) {
    query = query.or(`nombre.ilike.%${searchQuery}%,siglas.ilike.%${searchQuery}%`);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);
  return data as Partido[];
}

export async function getPartidoById(id: string | number) {
  const admin = await getUsuarioActual();
  if (!admin) throw new Error("No autenticado");

  const service = createServiceClient();
  const { data, error } = await service
    .from("partidos")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);
  return data as Partido;
}

export async function createPartido(data: { 
  nombre: string; 
  siglas: string; 
  color: string; 
  estatus: "activo" | "inactivo" 
}) {
  await assertAdmin();

  // Hardened validation
  if (!data.nombre.trim()) throw new Error("El nombre es obligatorio");
  if (!data.siglas.trim()) throw new Error("Las siglas son obligatorias");
  validateHexColor(data.color);
  if (!["activo", "inactivo"].includes(data.estatus)) throw new Error("Estatus inválido");

  const service = createServiceClient();

  const { error } = await service.from("partidos").insert({
    nombre: data.nombre.trim(),
    siglas: data.siglas.trim().toUpperCase(),
    color: data.color,
    estatus: data.estatus,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/admin/catalogos/partidos");
  return { success: true };
}

export async function updatePartido(id: string | number, data: { 
  nombre: string; 
  siglas: string; 
  color: string; 
  estatus: "activo" | "inactivo" 
}) {
  await assertAdmin();

  // Hardened validation
  if (!data.nombre.trim()) throw new Error("El nombre es obligatorio");
  if (!data.siglas.trim()) throw new Error("Las siglas son obligatorias");
  validateHexColor(data.color);
  if (!["activo", "inactivo"].includes(data.estatus)) throw new Error("Estatus inválido");

  const service = createServiceClient();

  const { error } = await service
    .from("partidos")
    .update({
      nombre: data.nombre.trim(),
      siglas: data.siglas.trim().toUpperCase(),
      color: data.color,
      estatus: data.estatus,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/admin/catalogos/partidos");
  revalidatePath(`/admin/catalogos/partidos/${id}`);
  return { success: true };
}
