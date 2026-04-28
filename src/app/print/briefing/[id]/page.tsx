import { getBriefingById } from "@/actions/briefings";
import { getUsuarioActual } from "@/actions/auth";
import { redirect, notFound } from "next/navigation";

type PageProps = { params: Promise<{ id: string }> };
type BriefingRecord = Awaited<ReturnType<typeof getBriefingById>>;
type BriefingMunicipio = BriefingRecord["municipios"];

export default async function PrintBriefingPage({ params }: PageProps) {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) redirect("/login");

  const { id } = await params;
  const briefingId = parseInt(id, 10);
  if (isNaN(briefingId)) return notFound();

  const briefing = await getBriefingById(briefingId);
  const municipioData = briefing.municipios as BriefingMunicipio;
  const municipioNombre =
    municipioData && !Array.isArray(municipioData)
      ? municipioData.nombre
      : `Municipio ${briefing.municipio_id}`;
  const fecha = new Date(briefing.created_at).toLocaleDateString("es-MX", { dateStyle: "long" });

  const sections = briefing.contenido.split("\n\n").map((block: string, i: number) => {
    const boldMatch = block.match(/^\*\*(.+?)\*\*/);
    if (boldMatch) {
      const title = boldMatch[1];
      const body = block.replace(/^\*\*(.+?)\*\*\s*/, "").trim();
      return (
        <div key={i} style={{ marginBottom: "1.25rem" }}>
          <h3 style={{ fontSize: 13, fontWeight: 900, color: "#1e293b", marginBottom: "0.4rem" }}>{title}</h3>
          {body && <p style={{ fontSize: 12, color: "#334155", lineHeight: 1.7 }}>{body}</p>}
        </div>
      );
    }
    if (block.startsWith("- ")) {
      const items = block.split("\n").filter((l) => l.startsWith("- "));
      return (
        <ul key={i} style={{ marginBottom: "1rem", paddingLeft: "1.2rem" }}>
          {items.map((item, j) => (
            <li key={j} style={{ fontSize: 12, color: "#334155", lineHeight: 1.7, marginBottom: "0.25rem" }}>
              {item.slice(2)}
            </li>
          ))}
        </ul>
      );
    }
    return (
      <p key={i} style={{ fontSize: 12, color: "#334155", lineHeight: 1.7, marginBottom: "1rem" }}>
        {block}
      </p>
    );
  });

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "2rem" }}>
      <div style={{ borderBottom: "3px solid #4f46e5", paddingBottom: "1rem", marginBottom: "1.5rem" }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 3 }}>
          SIPEEM · Briefing Estratégico · IA
        </p>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: "#0f172a", margin: "0.25rem 0" }}>
          {municipioNombre}
        </h1>
        <p style={{ fontSize: 11, color: "#94a3b8" }}>
          Generado el {fecha} · por {briefing.generado_por}
        </p>
      </div>

      <div>{sections}</div>

      <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "0.75rem", marginTop: "2rem" }}>
        <p style={{ fontSize: 9, color: "#cbd5e1", textAlign: "center", fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>
          SIPEEM · Análisis generado con IA · Documento confidencial
        </p>
      </div>

      <script dangerouslySetInnerHTML={{ __html: "window.onload = () => window.print();" }} />
    </div>
  );
}
