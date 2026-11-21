"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITENS = [
  { href: "/", rotulo: "Painel", icone: "◎" },
  { href: "/lancamentos", rotulo: "Lançamentos", icone: "☰" },
  { href: "/orcamento", rotulo: "Metas", icone: "◷" },
  { href: "/contas", rotulo: "Contas", icone: "▣" },
  { href: "/recorrencias", rotulo: "Fixas", icone: "↻" },
  { href: "/configuracoes", rotulo: "Ajustes", icone: "⚙" },
];

/** Barra inferior no celular, linha de links no desktop. */
export function Nav() {
  const atual = usePathname();
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-200 bg-white/95 backdrop-blur md:static md:border-0 md:bg-transparent dark:border-zinc-800 dark:bg-zinc-950/95 md:dark:bg-transparent"
    >
      <ul className="mx-auto flex max-w-3xl justify-around md:justify-start md:gap-1">
        {ITENS.map((i) => {
          const ativo = i.href === "/" ? atual === "/" : atual.startsWith(i.href);
          return (
            <li key={i.href}>
              <Link
                href={i.href}
                aria-current={ativo ? "page" : undefined}
                className={`flex flex-col items-center px-2 py-2 text-xs md:flex-row md:gap-1 md:rounded-lg md:px-3 md:text-sm focus-visible:outline-2 focus-visible:outline-emerald-600 ${
                  ativo ? "font-bold text-emerald-800 dark:text-emerald-400" : "text-zinc-600 dark:text-zinc-400"
                }`}
              >
                <span aria-hidden className="text-lg md:text-sm">
                  {i.icone}
                </span>
                {i.rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
