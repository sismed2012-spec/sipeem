import { getMunicipioStrategicFile } from "@/actions/estrategia";
import { getActoresMunicipio } from "@/actions/actores";
import { getUsuarioActual } from "@/actions/auth";
import { redirect, notFound } from "next/navigation";

type PageProps = { params: Promise<{ id: string }> };

export default async function PrintMunicipioPage({ params }: PageProps) {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) redirect("/login");

  const { id } = await params;
  const municipioId = parseInt(id, 10);
  if (isNaN(municipioId)) return notFound();

  const [{ estrategia, electoral }, actores] = await Promise.all([
    getMunicipioStrategicFile(municipioId),
    getActoresMunicipio(municipioId),
  ]);

  const nombre = electoral?.summary?.nombre ?? `Municipio ${municipioId}`;
  const fecha = new Date().toLocaleDateString("es-MX", { dateStyle: "long" });

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "2rem" }}>
      {/* Header */}
      <div style={{ borderBottom: "3px solid #1e293b", paddingBottom: "1rem", marginBottom: "1.5rem" }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 3 }}>
          SIPEEM · Ficha Estratégica Municipal
        </p>
        <h1 style={{ fontSize: 28, fontWeight: 900, color: "#0f172a", margin: "0.25rem 0" }}>
          {nombre}
        </h1>
        <p style={{ fontSize: 11, color: "#94a3b8" }}>Generado el {fecha}</p>
      </div>

      {/* Estrategia */}
      {estrategia && (
        <section style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: 11, fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: 2, marginBottom: "0.75rem" }}>
            Identidad Estratégica
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.5rem", marginBottom: "1rem" }}>
            {[
              { label: "Prioridad", value: estrategia.prioridad },
              { label: "Riesgo", value: estrategia.riesgo },
              { label: "Oportunidad", value: estrategia.oportunidad },
              { label: "Estatus", value: estrategia.estatus },
            ].map((item) => (
              <div key={item.label} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "0.5rem" }}>
                <p style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>{item.label}</p>
                <p style={{ fontSize: 14, fontWeight: 900, color: "#1e293b" }}>{item.value}</p>
              </div>
            ))}
          </div>
          {estrategia.notas_ejecutivas && (
            <div style={{ marginBottom: "0.75rem" }}>
              <p style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 }}>Notas Ejecutivas</p>
              <p style={{ fontSize: 12, color: "#334155", lineHeight: 1.6 }}>{estrategia.notas_ejecutivas}</p>
            </div>
          )}
          {estrategia.notas_operativas && (
            <div>
              <p style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 }}>Notas Operativas</p>
              <p style={{ fontSize: 12, color: "#334155", lineHeight: 1.6 }}>{estrategia.notas_operativas}</p>
            </div>
          )}
        </section>
      )}

      {/* Termómetros */}
      {actores.termometros && (
        <section style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: 11, fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: 2, marginBottom: "0.75rem" }}>
            Termómetros Políticos
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0.5rem" }}>
            {(["term1", "term2", "term3", "term4", "term5"] as const).map((k, i) => (
              <div key={k} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "0.5rem", textAlign: "center" }}>
                <p style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8" }}>T{i + 1}</p>
                <p style={{ fontSize: 20, fontWeight: 900, color: "#1e293b" }}>{actores.termometros![k]}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Comité */}
      {actores.comite && (
        <section style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: 11, fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: 2, marginBottom: "0.75rem" }}>
            Comité Municipal
          </h2>
          <p style={{ fontSize: 12, color: "#334155" }}>
            <strong>Presidente:</strong> {actores.comite.presidente} ·{" "}
            <strong>Secretario:</strong> {actores.comite.secretario} ·{" "}
            <strong>Inaugurado:</strong> {actores.comite.inaugurado ? "Sí" : "No"}
          </p>
        </section>
      )}

      {/* Planilla */}
      {actores.planilla.length > 0 && (
        <section style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: 11, fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: 2, marginBottom: "0.75rem" }}>
            Planilla de Candidatos ({actores.planilla.length})
          </h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ backgroundColor: "#f8fafc" }}>
                <th style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid #e2e8f0" }}>Cargo</th>
                <th style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid #e2e8f0" }}>Nombre</th>
                <th style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid #e2e8f0" }}>Partido</th>
              </tr>
            </thead>
            <tbody>
              {actores.planilla.map((p) => (
                <tr key={p.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "4px 8px", color: "#475569" }}>{p.cargo}</td>
                  <td style={{ padding: "4px 8px", fontWeight: 600, color: "#1e293b" }}>{p.nombre}</td>
                  <td style={{ padding: "4px 8px", color: "#475569" }}>{p.partido}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Aspirantes */}
      {actores.aspirantes.length > 0 && (
        <section style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: 11, fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: 2, marginBottom: "0.75rem" }}>
            Aspirantes Registrados ({actores.aspirantes.length})
          </h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ backgroundColor: "#f8fafc" }}>
                <th style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid #e2e8f0" }}>Nombre</th>
                <th style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid #e2e8f0" }}>Cargo aspirado</th>
                <th style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid #e2e8f0" }}>Partido</th>
                <th style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid #e2e8f0" }}>Contacto</th>
              </tr>
            </thead>
            <tbody>
              {actores.aspirantes.map((a) => (
                <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "4px 8px", fontWeight: 600, color: "#1e293b" }}>{a.nombre}</td>
                  <td style={{ padding: "4px 8px", color: "#475569" }}>{a.cargo_aspirado}</td>
                  <td style={{ padding: "4px 8px", color: "#475569" }}>{a.partido}</td>
                  <td style={{ padding: "4px 8px", color: "#475569" }}>{a.telefono ?? a.email ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Footer */}
      <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "0.75rem", marginTop: "2rem" }}>
        <p style={{ fontSize: 9, color: "#cbd5e1", textAlign: "center", fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>
          SIPEEM v2.0 · Documento confidencial · Uso interno
        </p>
      </div>

      {/* Auto-print trigger */}
      <script dangerouslySetInnerHTML={{ __html: "window.onload = () => window.print();" }} />
    </div>
  );
}
