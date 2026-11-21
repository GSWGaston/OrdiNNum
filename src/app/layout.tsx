import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Finanças", template: "%s · Finanças" },
  description: "Quanto posso gastar hoje sem comprometer minha meta do mês?",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // tema salvo em cookie pelo Ajustes: o servidor já manda a classe certa, sem piscar e sem script
  const tema = (await cookies()).get("tema")?.value;
  const classeTema = tema === "claro" ? "tema-claro" : tema === "escuro" ? "tema-escuro" : "";
  return (
    <html lang="pt-BR" className={`h-full antialiased ${classeTema}`}>
      <body className="min-h-full bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">{children}</body>
    </html>
  );
}
