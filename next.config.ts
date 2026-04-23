import type { NextConfig } from "next";

const securityHeaders = [
  // Impide que la app sea embebida en un <iframe> en otros dominios (clickjacking)
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Evita que el navegador adivine el MIME type de las respuestas
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Solo envía el origen como referrer (oculta paths al navegar fuera)
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Desactiva funcionalidades del navegador no usadas por la app
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
