export class CartografiaConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CartografiaConfigError";
  }
}

type CartografiaEnvironment = Record<string, string | undefined>;

export type CartografiaSupabaseConfig = {
  url: string;
  serviceRoleKey: string;
};

export function getCartografiaSupabaseConfig(
  environment: CartografiaEnvironment = process.env
): CartografiaSupabaseConfig {
  const rawUrl = environment.CARTOGRAFIA_SUPABASE_URL?.trim();
  const serviceRoleKey =
    environment.CARTOGRAFIA_SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!rawUrl || !serviceRoleKey) {
    throw new CartografiaConfigError(
      "Faltan CARTOGRAFIA_SUPABASE_URL o CARTOGRAFIA_SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new CartografiaConfigError(
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
    throw new CartografiaConfigError(
      "CARTOGRAFIA_SUPABASE_URL debe ser una URL HTTPS sin credenciales, consulta ni fragmento"
    );
  }

  return {
    url: parsedUrl.toString().replace(/\/$/, ""),
    serviceRoleKey,
  };
}

