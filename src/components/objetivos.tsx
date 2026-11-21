import type { StatusObjetivo } from "@/lib/calculos/objetivos";
import { formatarData, formatarReais } from "@/lib/formato";

export const STATUS: Record<StatusObjetivo, { texto: string; cor: string; barra: string }> = {
  concluido: { texto: "✓ Concluído", cor: "text-emerald-700 dark:text-emerald-400", barra: "bg-emerald-600" },
  adiantado: { texto: "▲ Adiantado", cor: "text-emerald-700 dark:text-emerald-400", barra: "bg-emerald-600" },
  no_ritmo: { texto: "✓ No ritmo", cor: "text-emerald-700 dark:text-emerald-400", barra: "bg-emerald-600" },
  atrasado: { texto: "⚠ Atrasado", cor: "text-amber-700 dark:text-amber-400", barra: "bg-amber-500" },
  sem_prazo: { texto: "Sem prazo", cor: "text-zinc-600 dark:text-zinc-400", barra: "bg-sky-600" },
};

type Resumo = {
  nome: string;
  valorAlvoCentavos: number;
  prazo: string | null;
  guardado: number;
  pct: number;
  andamento: StatusObjetivo;
  aporteMensal: number | null;
  dataEstimada: string | null;
  meses: number | null;
};

/** Frase que diz o que fazer: quanto guardar por mês, ou quando chega lá. */
export function sugestao(o: Resumo) {
  if (o.andamento === "concluido") return "Objetivo alcançado!";
  if (o.aporteMensal !== null)
    return `Guarde ${formatarReais(o.aporteMensal)} por mês até ${formatarData(o.prazo!)} (${o.meses} ${o.meses === 1 ? "mês" : "meses"})`;
  return o.dataEstimada
    ? `No ritmo dos últimos 3 meses, você chega lá por volta de ${formatarData(o.dataEstimada)}`
    : "Faça aportes para o app estimar quando você chega lá";
}

export function BarraObjetivo({ o }: { o: Resumo }) {
  const s = STATUS[o.andamento];
  return (
    <div className="text-sm">
      <div className="flex justify-between gap-2">
        <span className="font-medium">{o.nome}</span>
        <span className={`text-xs font-semibold ${s.cor}`}>{s.texto}</span>
      </div>
      <div
        className="mt-1 h-2 rounded-full bg-zinc-200 dark:bg-zinc-800"
        role="progressbar"
        aria-valuenow={o.pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${o.nome}: ${o.pct}% do objetivo`}
      >
        <div className={`h-2 rounded-full ${s.barra}`} style={{ width: `${o.pct}%` }} />
      </div>
      <p className="tabular mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
        {formatarReais(o.guardado)} de {formatarReais(o.valorAlvoCentavos)} ({o.pct}%) · {sugestao(o)}
      </p>
    </div>
  );
}
