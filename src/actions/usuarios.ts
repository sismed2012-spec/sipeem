"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";

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
 * Validates user input before processing.
 */
function validateUserData(data: { nombre: string; email: string; rol: string }) {
  const allowedRoles = ["director", "admin", "operador"];
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!data.nombre.trim()) throw new Error("El nombre no puede estar vacío");
  if (!data.email.trim() || !emailRegex.test(data.email)) throw new Error("Correo electrónico inválido");
  if (!allowedRoles.includes(data.rol)) throw new Error("Rol no permitido para este sistema");
}

export async function getUsuarios() {
  await assertAdmin();
  const service = createServiceClient();
  const { data, error } = await service
    .from("usuarios")
    .select("*")
    .order("nombre");

  if (error) throw new Error(error.message);
  return data;
}

export async function getUsuarioById(id: string) {
  await assertAdmin();
  const service = createServiceClient();
  const { data, error } = await service
    .from("usuarios")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function createUsuario(data: { nombre: string; email: string; rol: string }) {
  await assertAdmin();
  
  // Basic input validation
  try {
    validateUserData(data);
  } catch (e: any) {
    return { success: false, error: e.message };
  }

  const service = createServiceClient();

  // 1. Generate a secure random temporary password (24 hex chars)
  const tempPassword = randomBytes(12).toString("hex");

  // 2. Create the identity in Supabase Auth
  const { data: authData, error: authError } = await service.auth.admin.createUser({
    email: data.email,
    password: tempPassword,
    email_confirm: true,
  });

  if (authError) {
    return { success: false, error: `Error Auth: ${authError.message}` };
  }

  const userId = authData.user.id;

  // 3. Create the application-level record
  const { error: dbError } = await service.from("usuarios").insert({
    id: userId,
    nombre: data.nombre.trim(),
    email: data.email.trim().toLowerCase(),
    rol: data.rol,
  });

  if (dbError) {
    // 4. Transactional Rollback: Clean up orphaned Auth user to avoid identity drift
    await service.auth.admin.deleteUser(userId);
    return { success: false, error: `Error DB: ${dbError.message}` };
  }

  revalidatePath("/admin/usuarios");
  return { success: true, password: tempPassword };
}

export async function updateUsuario(id: string, data: { nombre: string; rol: string }) {
  await assertAdmin();

  // Validate the role (email is ignored in update as it is read-only)
  const allowedRoles = ["director", "admin", "operador"];
  if (!data.nombre.trim()) throw new Error("El nombre no puede estar vacío");
  if (!allowedRoles.includes(data.rol)) throw new Error("Rol no permitido");

  const service = createServiceClient();

  const { error } = await service
    .from("usuarios")
    .update({
      nombre: data.nombre.trim(),
      rol: data.rol,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/admin/usuarios");
  revalidatePath(`/admin/usuarios/${id}`);
  return { success: true };
}
