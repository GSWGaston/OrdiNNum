import Link from "next/link";
import type { progressoOrcamentos } from "@/lib/calculos/orcamento";
import { formatarReais } from "@/lib/formato";
import { cartao, link } from "./estilos";

export type Progresso = ReturnType<typeof progressoOrcamentos>[number];

const ESTADO = {
  ok: { texto: "", cor: "bg-emerald-600" },
  alerta: { texto: "⚠ passou de 80%", cor: "bg-amber-500" },
  estourado: { texto: "✕ limite estourado", cor: "bg-red-600" },
} as const;

/** Barra de uma categoria: gasto x limite, com texto do estado (não só cor). */
export function BarraOrcamento({ p, nome, cor }: { p: Progresso; nome: string; cor: string }) {
  const e = ESTADO[p.estado];
  return (
    <div className="text-sm">
      <div className="flex justify-between gap-2">
        <span>
          <span aria-hidden className="mr-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: cor }} />
          {nome}
          {e.texto && (
            <strong className={`ml-1 text-xs ${p.estado === "estourado" ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`}>
              {e.texto}
            </strong>
          )}
        </span>
        <span className="tabular">
          {formatarReais(p.gasto)} de {formatarReais(p.limiteCentavos)}
        </span>
      </div>
      <div
        className="mt-1 h-2 rounded-full bg-zinc-200 dark:bg-zinc-800"
        role="progressbar"
        aria-valuenow={p.pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${nome}: ${p.pct}% do limite`}
      >
        <div className={`h-2 rounded-full ${e.cor}`} style={{ width: `${Math.min(100, p.pct)}%` }} />
      </div>
      <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
        {p.restante >= 0 ? `Restam ${formatarReais(p.restante)} (${p.pct}% usado)` : `Passou ${formatarReais(-p.restante)} (${p.pct}%)`}
      </p>
    </div>
  );
}

/** Painel: só as categorias que já passaram de 80%. */
export function AlertasOrcamento({ progresso, categorias }: { progresso: Progresso[]; categorias: Map<string, { nome: string; cor: string }> }) {
  const alertas = progresso.filter((p) => p.estado !== "ok");
  if (!alertas.length) return null;
  return (
    <section className={`${cartao} flex flex-col gap-3`} aria-labelledby="alertas-orc">
      <h2 id="alertas-orc" className="font-semibold">
        Limites de categoria
      </h2>
      {alertas.map((p) => {
        const c = categorias.get(p.categoriaId);
        return <BarraOrcamento key={p.categoriaId} p={p} nome={c?.nome ?? "?"} cor={c?.cor ?? "#a1a1aa"} />;
      })}
      <Link href="/orcamento#limites" className={`${link} text-xs`}>
        Ver todos os limites
      </Link>
    </section>
  );
}
