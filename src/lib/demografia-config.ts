export class DemografiaConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemografiaConfigError";
  }
}

type DemografiaEnvironment = Record<string, string | undefined>;

export type DemografiaSupabaseConfig = {
  url: string;
  serviceRoleKey: string;
};

export function getDemografiaSupabaseConfig(
  environment: DemografiaEnvironment = process.env
): DemografiaSupabaseConfig {
  const rawUrl = environment.CARTOGRAFIA_SUPABASE_URL?.trim();
  const serviceRoleKey =
    environment.CARTOGRAFIA_SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!rawUrl || !serviceRoleKey) {
    throw new DemografiaConfigError(
      "Faltan CARTOGRAFIA_SUPABASE_URL o CARTOGRAFIA_SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new DemografiaConfigError(
      "CARTOGRAFIA_SUPABASE_URL debe ser una URL HTTPS valida"
    );
  }

  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new DemografiaConfigError(
      "CARTOGRAFIA_SUPABASE_URL debe ser una URL HTTPS sin credenciales, consulta ni fragmento"
    );
  }

  return {
    url: parsedUrl.toString().replace(/\/$/, ""),
    serviceRoleKey,
  };
}
