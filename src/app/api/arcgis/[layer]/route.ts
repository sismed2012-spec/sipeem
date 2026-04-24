import { NextRequest, NextResponse } from "next/server";
import { getUsuarioActual } from "@/actions/auth";
import { isArcGISEnabled, isArcGISLayer, queryLayer } from "@/lib/arcgis";

export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/arcgis/[layer]">
) {
  const usuario = await getUsuarioActual();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (!isArcGISEnabled()) {
    return NextResponse.json({ error: "ArcGIS no configurado" }, { status: 503 });
  }

  const { layer } = await context.params;
  if (!isArcGISLayer(layer)) {
    return NextResponse.json(
      {
        error: `Capa '${layer}' no existe. Válidas: distrito_federal, distrito_local, entidad, municipio, seccion`,
      },
      { status: 404 }
    );
  }

  const sp = request.nextUrl.searchParams;
  const where = sp.get("where") ?? undefined;

  if (layer === "seccion" && !where) {
    return NextResponse.json(
      { error: "Agrega filtro where para consultar secciones (ej. ?where=CVE_MUN=106)" },
      { status: 400 }
    );
  }

  const params = {
    where,
    outFields: sp.get("outFields") ?? undefined,
    returnGeometry: sp.has("returnGeometry")
      ? sp.get("returnGeometry") !== "false"
      : true,
    outSR: sp.has("outSR") ? Number(sp.get("outSR")) : 4326,
    resultRecordCount: layer === "seccion" ? 2000 : undefined,
    resultOffset: sp.has("resultOffset") ? Number(sp.get("resultOffset")) : undefined,
  };

  try {
    const data = await queryLayer(layer, params);
    return NextResponse.json(data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Error desconocido";
    if (msg.includes("Token ArcGIS inválido")) {
      return NextResponse.json({ error: "Token ArcGIS inválido" }, { status: 502 });
    }
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
