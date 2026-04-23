"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";
import { redirect } from "next/navigation";
import { generarApiKey, hashApiKey } from "@/lib/api-keys";

export type ApiKey = {
  id: number;
  nombre: string;
  key_prefix: string;
  activa: boolean;
  creada_por: string;
  ultimo_uso: string | null;
  usos_totales: number;
  created_at: string;
};

export type NuevaKeyResult = {
  key: string;
  registro: ApiKey;
};

export async function getApiKeys(): Promise<ApiKey[]> {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) redirect("/login");

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("api_keys")
    .select("id, nombre, key_prefix, activa, creada_por, ultimo_uso, usos_totales, created_at")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as ApiKey[];
}

export async function crearApiKey(nombre: string): Promise<NuevaKeyResult> {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) redirect("/login");

  if (!nombre.trim()) throw new Error("El nombre es requerido");

  const svc = createServiceClient();
  const { key, prefix } = generarApiKey();
  const hash = await hashApiKey(key);

  const { data, error } = await svc
    .from("api_keys")
    .insert({
      nombre: nombre.trim(),
      key_hash: hash,
      key_prefix: prefix,
      creada_por: usuario.email,
    })
    .select("id, nombre, key_prefix, activa, creada_por, ultimo_uso, usos_totales, created_at")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/admin/api-keys");
  return { key, registro: data as ApiKey };
}

export async function revocarApiKey(id: number): Promise<void> {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) redirect("/login");

  const svc = createServiceClient();
  const { error } = await svc.from("api_keys").update({ activa: false }).eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/admin/api-keys");
}
