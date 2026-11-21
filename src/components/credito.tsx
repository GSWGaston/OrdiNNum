import type { Faixa, Faixas } from "@/lib/calculos/credito";

// cor + texto (nunca só cor)
export const FAIXA = {
  verde: { texto: "✓ uso tranquilo", cor: "bg-emerald-600", textoCor: "text-emerald-700 dark:text-emerald-400" },
  amarela: { texto: "⚠ uso moderado", cor: "bg-amber-500", textoCor: "text-amber-700 dark:text-amber-400" },
  vermelha: { texto: "✕ uso alto", cor: "bg-red-600", textoCor: "text-red-700 dark:text-red-400" },
} as const;

/** Barra de uso do limite com as marcas das faixas (ex.: 30% e 60%). */
export function MedidorCredito({ usoPct, faixa, faixas, rotulo }: { usoPct: number; faixa: Faixa; faixas: Faixas; rotulo: string }) {
  const pct = Math.round(usoPct);
  const f = FAIXA[faixa];
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className={`text-sm font-semibold ${f.textoCor}`}>{f.texto}</span>
        <span className={`tabular text-2xl font-black ${f.textoCor}`}>{pct}%</span>
      </div>
      <div
        className="relative mt-1 h-3 rounded-full bg-zinc-200 dark:bg-zinc-800"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${rotulo}: ${pct}% do limite usado`}
      >
        <div className={`h-3 rounded-full ${f.cor}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
        {[faixas.amarelaPct, faixas.vermelhaPct].map((m) => (
          <span key={m} aria-hidden className="absolute top-0 h-3 w-0.5 bg-zinc-500" style={{ left: `${m}%` }} />
        ))}
      </div>
      <div className="relative mt-0.5 h-4 text-[10px] text-zinc-500" aria-hidden>
        {[faixas.amarelaPct, faixas.vermelhaPct].map((m) => (
          <span key={m} className="absolute -translate-x-1/2" style={{ left: `${m}%` }}>
            {m}%
          </span>
        ))}
      </div>
    </div>
  );
}
