import { createServiceClient } from "@/lib/supabase/service";

/**
 * Genera una API key aleatoria y su prefijo para identificación.
 * La key real se muestra UNA VEZ al crear — el hash se guarda en DB.
 */
export function generarApiKey(): { key: string; prefix: string } {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const key =
    "sk_sipeem_" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  const prefix = key.slice(0, 18); // "sk_sipeem_" + 8 hex chars
  return { key, prefix };
}

/**
 * Hashea una API key con SHA-256 usando Web Crypto API (Node.js 18+).
 */
export async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Valida una API key contra la DB. Retorna true si es válida y activa.
 * Actualiza `ultimo_uso` y `usos_totales` en background.
 */
export async function validarApiKey(key: string): Promise<boolean> {
  if (!key || !key.startsWith("sk_sipeem_")) return false;

  try {
    const hash = await hashApiKey(key);
    const svc = createServiceClient();

    const { data, error } = await svc
      .from("api_keys")
      .select("id, activa, usos_totales")
      .eq("key_hash", hash)
      .single();

    if (error || !data || !data.activa) return false;

    // Update usage stats fire-and-forget
    svc
      .from("api_keys")
      .update({
        ultimo_uso: new Date().toISOString(),
        usos_totales: data.usos_totales + 1,
      })
      .eq("id", data.id)
      .then(() => {});

    return true;
  } catch {
    return false;
  }
}
