"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";
import { Municipio } from "@/lib/types";
import * as fs from "fs";
import * as path from "path";

async function assertAdmin() {
  const usuario = await getUsuarioActual();
  if (!usuario || (usuario.rol !== "director" && usuario.rol !== "admin")) {
    throw new Error("Privilegios insuficientes para esta operación");
  }
}

/**
 * Normaliza nombres para comparación (sin acentos, mayúsculas, sin puntuación)
 */
function normalize(s: string) {
  if (!s) return "";
  return s.toString().toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Quitar acentos
    .replace(/[^A-Z0-9\s]/g, "") // Quitar caracteres especiales
    .trim();
}

/**
 * Sincroniza el catálogo de municipios desde el GeoJSON oficial.
 * Idempotente y seguro de ejecutar múltiples veces.
 */
export async function syncMunicipiosFromGeoJSON() {
  await assertAdmin();
  const service = createServiceClient();
  
  // 1. Cargar el GeoJSON (Asset de Verdad)
  const geojsonPath = path.resolve(process.cwd(), "public/maps/edomex_municipios_wgs84.geojson");
  
  if (!fs.existsSync(geojsonPath)) {
    throw new Error(`No se encontró el archivo GeoJSON en: ${geojsonPath}`);
  }

  const geojson = JSON.parse(fs.readFileSync(geojsonPath, "utf-8"));
  
  // 2. Obtener catálogo actual de la DB
  const { data: currentMuns, error: fetchError } = await service
    .from("municipios")
    .select("*");

  if (fetchError || !currentMuns) {
    throw new Error("Fallo al conectar con el catálogo de municipios");
  }

  const results = {
    processed: 0,
    created: 0,
    updated: 0,
    ambiguous: [] as string[]
  };

  const dbMuns = currentMuns as Municipio[];

  for (const feature of geojson.features) {
    results.processed++;
    const { municipio: geoId, nombre: geoName } = feature.properties;
    const geoNameNorm = normalize(geoName);

    // Estrategia de búsqueda
    // A. Buscar por coincidencia exacta de geo_municipio_id
    let target = dbMuns.find(m => m.geo_municipio_id === geoId);

    if (!target) {
      // B. Fallback: Buscar por nombre normalizado (solo si no tiene ID geográfico asignado)
      const matches = dbMuns.filter(m => !m.geo_municipio_id && normalize(m.nombre) === geoNameNorm);
      
      if (matches.length === 1) {
        target = matches[0];
      } else if (matches.length > 1) {
        results.ambiguous.push(geoName);
        continue; // Saltar si hay ambigüedad crítica
      }
    }

    if (target) {
      // Actualizar registro existente con metadatos oficiales del mapa
      const { error } = await service
        .from("municipios")
        .update({
          geo_municipio_id: geoId,
          nombre_oficial_geojson: geoName
        })
        .eq("id", target.id);
      
      if (!error) results.updated++;
    } else {
      // Crear nuevo municipio oficial de raíz
      const { error } = await service
        .from("municipios")
        .insert({
          nombre: geoName, // Guardamos el nombre tal cual viene del mapa para consistencia
          geo_municipio_id: geoId,
          nombre_oficial_geojson: geoName,
          estatus: "activo"
        });
      
      if (!error) results.created++;
    }
  }

  revalidatePath("/admin/catalogos/municipios");
  revalidatePath("/mapa");
  
  return results;
}
