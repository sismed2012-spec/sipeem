"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";
import { Configuracion } from "@/lib/types";

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
 * Normalizes a key: uppercase, no spaces, only underscores/numbers/letters.
 */
function normalizeClave(clave: string) {
  return clave
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_]/g, "");
}

export async function getParametros(searchQuery?: string) {
  await assertAdmin();
  
  const service = createServiceClient();
  let query = service.from("configuracion").select("*").order("clave");
  
  if (searchQuery) {
    query = query.or(`clave.ilike.%${searchQuery}%,categoria.ilike.%${searchQuery}%,descripcion.ilike.%${searchQuery}%`);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);
  return data as Configuracion[];
}

export async function getParametroById(id: string | number) {
  await assertAdmin();

  const service = createServiceClient();
  const { data, error } = await service
    .from("configuracion")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);
  return data as Configuracion;
}

export async function createParametro(data: { 
  clave: string; 
  valor: string; 
  categoria: string; 
  descripcion: string; 
}) {
  await assertAdmin();

  const normalizedClave = normalizeClave(data.clave);
  if (!normalizedClave) throw new Error("La clave es inválida o está vacía");
  if (!data.valor.trim()) throw new Error("El valor es obligatorio");
  if (!data.categoria.trim()) throw new Error("La categoría es obligatoria");

  const service = createServiceClient();

  // Duplicate check
  const { data: existing } = await service
    .from("configuracion")
    .select("id")
    .eq("clave", normalizedClave)
    .maybeSingle();

  if (existing) {
    throw new Error(`La clave '${normalizedClave}' ya existe en el sistema`);
  }

  const { error } = await service.from("configuracion").insert({
    clave: normalizedClave,
    valor: data.valor.trim(),
    categoria: data.categoria.trim() || "General",
    descripcion: data.descripcion.trim() || null,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/admin/catalogos/parametros");
  return { success: true };
}

export async function updateParametro(id: string | number, data: { 
  clave: string; 
  valor: string; 
  categoria: string; 
  descripcion: string; 
}) {
  await assertAdmin();

  const normalizedClave = normalizeClave(data.clave);
  if (!normalizedClave) throw new Error("La clave es inválida");
  if (!data.valor.trim()) throw new Error("El valor es obligatorio");
  if (!data.categoria.trim()) throw new Error("La categoría es obligatoria");

  const service = createServiceClient();

  // Duplicate check (excluding self)
  const { data: existing } = await service
    .from("configuracion")
    .select("id")
    .eq("clave", normalizedClave)
    .neq("id", id)
    .maybeSingle();

  if (existing) {
    throw new Error(`La clave '${normalizedClave}' ya está en uso por otro parámetro`);
  }

  const { error } = await service
    .from("configuracion")
    .update({
      clave: normalizedClave,
      valor: data.valor.trim(),
      categoria: data.categoria.trim(),
      descripcion: data.descripcion.trim() || null,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/admin/catalogos/parametros");
  revalidatePath(`/admin/catalogos/parametros/${id}`);
  return { success: true };
}
