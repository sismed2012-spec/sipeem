import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

type HistorialSeedItem = {
  p: string;
  v: string | number;
  pct: string | number;
  data?: unknown[];
};

type SeedMunicipioData = {
  color: string;
  sec_inicio: number;
  secciones: number;
  regidores: number;
  alcalde: string;
  partido: string;
  nom: string | number;
  padron: string | number;
  votos_totales: string | number;
  votos: string | number;
  dif_votos: string | number;
  dif_pct: string | number;
  part: string | number;
  sec_ganadas?: number;
  hist?: Record<string, HistorialSeedItem>;
  term1?: number;
  term2?: number;
  term3?: number;
  term4?: number;
  term5?: number;
  e1_comp?: string;
  e1_rec?: string;
  e2_gen?: string;
  e2_atr?: string;
  e3_gob?: string;
  e3_dem?: string;
  e4_niv?: string;
  e4_foco?: string;
  pri_pte?: string;
  pri_sec?: string;
  estadoHTML?: {
    inaugurado?: boolean;
    linkMaps?: string | null;
  };
};

function parseNum(s: string | number): number {
  if (typeof s === "number") return s;
  return parseInt(s.replace(/,/g, ""), 10) || 0;
}

function parsePct(s: string | number): number {
  if (typeof s === "number") return s;
  return parseFloat(s.replace("%", "")) || 0;
}

async function seed() {
  const jsonPath = path.resolve(
    __dirname,
    "../../SIPEEM_BaseDatos_Segura_20260408_1540.json"
  );
  const raw = JSON.parse(
    fs.readFileSync(jsonPath, "utf-8")
  ) as Record<string, SeedMunicipioData>;

  for (const [nombre, data] of Object.entries(raw)) {
    console.log(`Seeding: ${nombre}`);

    // 1. Insert municipio
    const { data: mun, error: munErr } = await supabase
      .from("municipios")
      .upsert(
        {
          nombre,
          color: data.color,
          sec_inicio: data.sec_inicio,
          secciones: data.secciones,
          regidores: data.regidores,
        },
        { onConflict: "nombre" }
      )
      .select("id")
      .single();

    if (munErr) {
      console.error(`  municipio error: ${munErr.message}`);
      continue;
    }

    const munId = mun.id;

    // 2. Alcalde
    await supabase.from("alcaldes").upsert(
      {
        municipio_id: munId,
        nombre: data.alcalde,
        partido: data.partido,
      },
      { onConflict: "municipio_id" }
    );

    // 3. Datos electorales
    await supabase.from("datos_electorales").upsert(
      {
        municipio_id: munId,
        nom: parseNum(data.nom),
        padron: parseNum(data.padron),
        votos_totales: parseNum(data.votos_totales),
        votos: parseNum(data.votos),
        dif_votos: parseNum(data.dif_votos),
        dif_pct: parsePct(data.dif_pct),
        participacion: parsePct(data.part),
        sec_ganadas: data.sec_ganadas || 0,
      },
      { onConflict: "municipio_id" }
    );

    // 4. Historial electoral
    if (data.hist) {
      for (const [anio, h] of Object.entries(data.hist)) {
        await supabase.from("historial_electoral").upsert(
          {
            municipio_id: munId,
            anio: parseInt(anio),
            partido_ganador: h.p,
            votos: parseNum(h.v),
            porcentaje: parsePct(h.pct),
            desglose: h.data || [],
          },
          { onConflict: "municipio_id,anio" }
        );
      }
    }

    // 5. Termometros
    await supabase.from("termometros").upsert(
      {
        municipio_id: munId,
        term1: data.term1 ?? 50,
        term2: data.term2 ?? 50,
        term3: data.term3 ?? 50,
        term4: data.term4 ?? 50,
        term5: data.term5 ?? 50,
      },
      { onConflict: "municipio_id" }
    );

    // 6. Escenarios
    await supabase.from("escenarios").upsert(
      {
        municipio_id: munId,
        e1_comp: data.e1_comp || "",
        e1_rec: data.e1_rec || "",
        e2_gen: data.e2_gen || "",
        e2_atr: data.e2_atr || "",
        e3_gob: data.e3_gob || "",
        e3_dem: data.e3_dem || "",
        e4_niv: data.e4_niv || "",
        e4_foco: data.e4_foco || "",
      },
      { onConflict: "municipio_id" }
    );

    // 7. Comite municipal
    await supabase.from("comite_municipal").upsert(
      {
        municipio_id: munId,
        presidente: data.pri_pte || "",
        secretario: data.pri_sec || "",
        inaugurado: data.estadoHTML?.inaugurado === true,
        link_maps: data.estadoHTML?.linkMaps || null,
      },
      { onConflict: "municipio_id" }
    );

    console.log(`  Done: ${nombre} (id: ${munId})`);
  }

  console.log("\nSeed complete!");
}

seed().catch(console.error);
