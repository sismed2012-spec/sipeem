export type ResultadoBusqueda = {
  titulo: string;
  url: string;
  contenido: string;
};

/**
 * Busca información web sobre una query usando Tavily API.
 * Retorna hasta 5 resultados con título, URL y snippet.
 */
export async function buscarWeb(query: string): Promise<ResultadoBusqueda[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("TAVILY_API_KEY no configurada en .env.local");

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      max_results: 5,
      include_answer: false,
    }),
  });

  if (!res.ok) throw new Error(`Tavily API error: ${res.status}`);

  const data = await res.json() as {
    results: { title: string; url: string; content: string }[];
  };

  return (data.results ?? []).map((r) => ({
    titulo: r.title,
    url: r.url,
    contenido: r.content.slice(0, 500),
  }));
}
