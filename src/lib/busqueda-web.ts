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
  const apiKey = process.env.TAVILY_API_KEY ?? process.env.TAVILY_KEY;
  if (!apiKey) {
    throw new Error("Pulso Digital no disponible: falta configurar TAVILY_API_KEY.");
  }

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

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error("Pulso Digital no autorizado: revisa la llave de Tavily.");
    }
    throw new Error(`Pulso Digital no disponible (Tavily ${res.status}).`);
  }

  const data = await res.json() as {
    results: { title: string; url: string; content: string }[];
  };

  const results = (data.results ?? []).map((r) => ({
    titulo: r.title,
    url: r.url,
    contenido: r.content.slice(0, 500),
  }));
  if (results.length === 0) {
    throw new Error("No se encontraron fuentes web para la consulta. Ajusta el texto de búsqueda.");
  }
  return results;
}
