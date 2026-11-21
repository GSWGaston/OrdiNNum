import Link from "next/link";
import type { gastoDiarioDoUsuario } from "@/lib/dados/metas";
import { formatarReais } from "@/lib/formato";
import { botao, cartao, link } from "./estilos";

type Dados = Awaited<ReturnType<typeof gastoDiarioDoUsuario>>;

// cor + ícone + texto: nunca só a cor (acessibilidade)
const ESTADOS = {
  ok: { texto: "✓ Dentro da meta", cor: "text-emerald-700 dark:text-emerald-400", barra: "bg-emerald-600" },
  perto: { texto: "⚠ Perto do limite de hoje", cor: "text-amber-700 dark:text-amber-400", barra: "bg-amber-500" },
  estourado: { texto: "✕ Limite de hoje estourado", cor: "text-red-700 dark:text-red-400", barra: "bg-red-600" },
} as const;

export const descreverMeta = (m: { modo: "economizar" | "saldo_final"; valorCentavos: number }) =>
  m.modo === "economizar" ? `economizar ${formatarReais(m.valorCentavos)} no mês` : `terminar o mês com ${formatarReais(m.valorCentavos)}`;

/** Destaque do painel: quanto posso gastar hoje. */
export function GastoDiario({ dados }: { dados: Dados }) {
  if (!dados)
    return (
      <section className={`${cartao} flex flex-col items-start gap-2`} aria-labelledby="gd">
        <h2 id="gd" className="text-lg font-bold">
          Quanto posso gastar hoje?
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Diga quanto quer economizar (ou com quanto quer terminar o mês) e o app calcula seu limite de cada dia.
        </p>
        <Link href="/orcamento" className={botao}>
          Definir minha meta
        </Link>
      </section>
    );

  if (!dados.alcancavel)
    return (
      <section className={`${cartao} flex flex-col gap-1 border-red-300 dark:border-red-900`} aria-labelledby="gd">
        <h2 id="gd" className="text-sm font-semibold text-red-700 dark:text-red-400">
          ✕ A meta deste mês não é alcançável
        </h2>
        <p className="text-sm">
          Para {descreverMeta(dados.meta)}, faltam <strong className="tabular">{formatarReais(dados.falta)}</strong>, mesmo sem gastar mais
          nada.
        </p>
        <Link href="/orcamento" className={`${link} text-sm`}>
          Ver a conta ou ajustar a meta
        </Link>
      </section>
    );

  const e = ESTADOS[dados.estado];
  const usoMes = dados.orcamentoMes > 0 ? Math.min(100, Math.round((dados.gastoMes / dados.orcamentoMes) * 100)) : 100;
  return (
    <section className={`${cartao} flex flex-col gap-1`} aria-labelledby="gd">
      <h2 id="gd" className="text-sm text-zinc-600 dark:text-zinc-400">
        {dados.restanteHoje >= 0 ? "Hoje você ainda pode gastar" : "Hoje você passou do limite em"}
      </h2>
      <p className={`tabular text-4xl font-black ${e.cor}`} data-testid="gasto-diario">
        {formatarReais(Math.abs(dados.restanteHoje))}
      </p>
      <p className={`text-sm font-semibold ${e.cor}`}>{e.texto}</p>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Limite de hoje {formatarReais(dados.limiteHoje)} · já gastou {formatarReais(dados.gastoHoje)} · {dados.dias} dia(s) até o fim do mês
      </p>
      <div className="mt-2">
        <div className="flex justify-between text-xs text-zinc-600 dark:text-zinc-400">
          <span>Gastos do dia a dia no mês</span>
          <span className="tabular">
            {formatarReais(dados.gastoMes)} de {formatarReais(dados.orcamentoMes)} ({usoMes}%)
          </span>
        </div>
        <div className="mt-1 h-2 rounded-full bg-zinc-200 dark:bg-zinc-800" role="progressbar" aria-valuenow={usoMes} aria-valuemin={0} aria-valuemax={100} aria-label="Uso do orçamento do mês">
          <div className={`h-2 rounded-full ${e.barra}`} style={{ width: `${usoMes}%` }} />
        </div>
      </div>
      <Link href="/orcamento" className={`${link} mt-1 text-xs`}>
        Meta: {descreverMeta(dados.meta)}
        {dados.meta.herdada ? " (mesma do mês passado)" : ""} · ver a conta
      </Link>
    </section>
  );
}
