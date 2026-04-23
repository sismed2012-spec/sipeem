export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <style>{`
          @media print {
            @page { margin: 1.5cm; size: A4 portrait; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
          body { font-family: system-ui, sans-serif; color: #1e293b; background: white; }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
