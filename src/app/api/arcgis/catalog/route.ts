import { NextResponse } from "next/server";
import { getUsuarioActual } from "@/actions/auth";
import {
  isArcGISEnabled,
  getArcGISAuthMode,
  getArcGISPortalUrl,
} from "@/lib/arcgis";

const LAYER_INFO = [
  { key: "municipio", name: "Municipios", queryPath: "/api/arcgis/municipio" },
  { key: "seccion", name: "Secciones electorales", queryPath: "/api/arcgis/seccion" },
  { key: "distrito_federal", name: "Distritos Federales", queryPath: "/api/arcgis/distrito_federal" },
  { key: "distrito_local", name: "Distritos Locales", queryPath: "/api/arcgis/distrito_local" },
  { key: "entidad", name: "Entidad", queryPath: "/api/arcgis/entidad" },
] as const;

export async function GET() {
  const usuario = await getUsuarioActual();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (!isArcGISEnabled()) {
    return NextResponse.json({
      enabled: false,
      message: "ArcGIS no configurado. Define ARCGIS_FEATURE_SERVER_URL en .env.local.",
      layers: [],
    });
  }

  return NextResponse.json({
    enabled: true,
    authMode: getArcGISAuthMode(),
    portalUrl: getArcGISPortalUrl(),
    layers: LAYER_INFO,
  });
}
