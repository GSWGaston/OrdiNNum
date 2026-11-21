import { ocorrenciasAte, type Periodicidade } from "./datas";

export type Lancamento = { valorCentavos: number; data: string; categoriaId: string | null };
export type RecorrenciaBase = { id: string; descricao: string; valorCentavos: number; periodicidade: Periodicidade; proximaData: string };

/** Saldo atual: conta manual soma os lançamentos até hoje ao saldo de abertura; conta do banco usa o saldo informado. */
export const saldoDaConta = (c: { origem: "manual" | "open_finance"; saldoCentavos: number }, somaAteHoje: number) =>
  c.origem === "manual" ? c.saldoCentavos + somaAteHoje : c.saldoCentavos;

/** Recorrências ainda não lançadas que vencem até `fim` (uma entrada por ocorrência). */
export function previstosAte(recorrencias: RecorrenciaBase[], fim: string) {
  return recorrencias
    .flatMap((r) => ocorrenciasAte(r.proximaData, r.periodicidade, fim).map((data) => ({ ...r, data })))
    .sort((a, b) => a.data.localeCompare(b.data));
}

/**
 * Resumo do mês. `lancamentos` = lançamentos do mês; `previstos` = recorrências pendentes até o fim do mês;
 * `saldoAtual` = soma dos saldos das contas hoje. Lançamentos com data futura ainda não estão no saldo atual.
 */
export function resumoDoMes(lancamentos: Lancamento[], previstos: { valorCentavos: number }[], saldoAtual: number, hoje: string) {
  let receitas = 0;
  let despesas = 0;
  let futuros = 0;
  for (const l of lancamentos) {
    if (l.valorCentavos >= 0) receitas += l.valorCentavos;
    else despesas -= l.valorCentavos;
    if (l.data > hoje) futuros += l.valorCentavos;
  }
  const somaPrevistos = previstos.reduce((s, p) => s + p.valorCentavos, 0);
  return {
    receitas,
    despesas,
    saldoMes: receitas - despesas,
    previstoReceitas: previstos.filter((p) => p.valorCentavos > 0).reduce((s, p) => s + p.valorCentavos, 0),
    previstoDespesas: -previstos.filter((p) => p.valorCentavos < 0).reduce((s, p) => s + p.valorCentavos, 0),
    saldoFimDoMes: saldoAtual + futuros + somaPrevistos,
  };
}

/** Despesas do mês agrupadas pela categoria raiz (subcategoria soma no pai). Maior primeiro. */
export function despesasPorCategoria(lancamentos: Lancamento[], categorias: { id: string; paiId: string | null }[]) {
  const pai = new Map(categorias.map((c) => [c.id, c.paiId]));
  const totais = new Map<string | null, number>();
  for (const l of lancamentos) {
    if (l.valorCentavos >= 0) continue;
    const raiz = l.categoriaId ? (pai.get(l.categoriaId) ?? l.categoriaId) : null;
    totais.set(raiz, (totais.get(raiz) ?? 0) - l.valorCentavos);
  }
  return [...totais].map(([categoriaId, total]) => ({ categoriaId, total })).sort((a, b) => b.total - a.total);
}
