import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SIPEEM - Sistema de Inteligencia Politica Electoral",
  description: "Sistema de Inteligencia Politica Electoral del Estado de Mexico",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es-MX">
      <body className={`${inter.className} text-slate-800`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
