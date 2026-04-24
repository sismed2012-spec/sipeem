"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";
import { queryLayer } from "@/lib/arcgis";
import { Municipio } from "@/lib/types";

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
 * Sincroniza el catálogo de municipios desde el FeatureServer ArcGIS.
 * Idempotente y seguro de ejecutar múltiples veces.
 */
export async function syncMunicipiosFromGeoJSON() {
  await assertAdmin();
  const service = createServiceClient();

  // 1. Obtener municipios de ArcGIS (sin geometría — solo atributos)
  const geojson = await queryLayer("municipio", {
    outFields: "*",
    returnGeometry: false,
  });

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
    const p = feature.properties ?? {};
    // ArcGIS field names vary by service version — use defensive fallback chain
    const geoId: number | null =
      p.CVEGEO ?? p.CVE_MUN ?? p.MUNICIPIO ?? p.municipio_id ?? null;
    const geoName: string =
      p.NOMGEO ?? p.NOM_MUN ?? p.NOMBRE ?? p.nombre ?? "";
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
