// Gasto diário sugerido (spec: Regras de cálculo, item 1).

export type Meta = { modo: "economizar" | "saldo_final"; valorCentavos: number };

export type LancamentoDia = {
  data: string;
  valorCentavos: number;
  contaId: string | null;
  cartaoId: string | null;
  transferenciaId: string | null;
  recorrenciaId: string | null;
  parcelaAtual: number | null;
};

export type EntradaGastoDiario = {
  hoje: string;
  fimDoMes: string;
  meta: Meta;
  contas: { id: string; tipo: string; saldoAtual: number }[];
  lancamentosMes: LancamentoDia[];
  /** recorrências ainda não lançadas que vencem até o fim do mês (positivas = receitas) */
  previstos: { valorCentavos: number }[];
  /** quanto se deve nos cartões por compras feitas até o fim do mês (compra conta no dia da compra) */
  dividaCartoes: number;
};

export const diasRestantes = (hoje: string, fim: string) =>
  Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / 86_400_000) + 1;

/** Gasto do dia a dia: saída que não é transferência, recorrência (fixa) nem parcela 2+ de um parcelamento. */
export const ehVariavel = (l: LancamentoDia) =>
  l.valorCentavos < 0 && !l.transferenciaId && !l.recorrenciaId && !(l.parcelaAtual && l.parcelaAtual > 1);

/**
 * Disp = ReceitasRestantes + SaldoAtual - FixasAPagar - Alvo; GastoDiario = Disp / DiasRestantes (inclui hoje).
 *
 * - Saldo atual: contas exceto "investimento" (dinheiro de gastar).
 * - Alvo: "terminar com Y" -> Y. "Economizar X" -> saldo no início do mês + X, descontando o que já foi
 *   transferido para conta de investimento no mês (isso já é economia). Na spec as duas fórmulas ficariam
 *   idênticas se "economizar X" usasse o saldo atual; ver README.
 * - Fixas a pagar: recorrências de despesa pendentes, lançamentos futuros de saída no mês e dívida dos cartões.
 * - O limite de HOJE é calculado como se os gastos variáveis de hoje não tivessem acontecido; assim
 *   "hoje você pode R$ X, já gastou Y" fica estável durante o dia, e o de amanhã sobe ou desce conforme hoje.
 */
export function calcularGastoDiario(e: EntradaGastoDiario) {
  const liquidas = new Set(e.contas.filter((c) => c.tipo !== "investimento").map((c) => c.id));
  const investimento = new Set(e.contas.filter((c) => c.tipo === "investimento").map((c) => c.id));
  const saldoAtual = e.contas.filter((c) => liquidas.has(c.id)).reduce((s, c) => s + c.saldoAtual, 0);

  const naLiquida = (l: LancamentoDia) => !!l.contaId && liquidas.has(l.contaId);
  const ateHoje = e.lancamentosMes.filter((l) => l.data <= e.hoje);
  const saldoInicioMes = saldoAtual - ateHoje.filter(naLiquida).reduce((s, l) => s + l.valorCentavos, 0);

  // transferências da conta líquida para a de investimento neste mês = já guardado
  const pares = new Map<string, LancamentoDia[]>();
  for (const l of ateHoje) if (l.transferenciaId) pares.set(l.transferenciaId, [...(pares.get(l.transferenciaId) ?? []), l]);
  let guardadoNoMes = 0;
  for (const par of pares.values()) {
    const saiu = par.find((l) => naLiquida(l) && l.valorCentavos < 0);
    const entrou = par.find((l) => l.contaId && investimento.has(l.contaId));
    if (saiu && entrou) guardadoNoMes -= saiu.valorCentavos;
  }

  const futuros = e.lancamentosMes.filter((l) => naLiquida(l) && l.data > e.hoje && !l.transferenciaId);
  const somaPos = (xs: { valorCentavos: number }[]) => xs.filter((x) => x.valorCentavos > 0).reduce((s, x) => s + x.valorCentavos, 0);
  const somaNeg = (xs: { valorCentavos: number }[]) => -xs.filter((x) => x.valorCentavos < 0).reduce((s, x) => s + x.valorCentavos, 0);

  const receitasRestantes = somaPos(e.previstos) + somaPos(futuros);
  const fixasAPagar = somaNeg(e.previstos) + somaNeg(futuros) + Math.max(0, e.dividaCartoes);
  const alvo = e.meta.modo === "economizar" ? saldoInicioMes + e.meta.valorCentavos - guardadoNoMes : e.meta.valorCentavos;
  const disponivel = receitasRestantes + saldoAtual - fixasAPagar - alvo;

  const variaveis = ateHoje.filter((l) => ehVariavel(l) && (l.cartaoId || naLiquida(l)));
  const gastoHoje = 0 - variaveis.filter((l) => l.data === e.hoje).reduce((s, l) => s + l.valorCentavos, 0);
  const gastoMes = 0 - variaveis.reduce((s, l) => s + l.valorCentavos, 0);
  const dias = diasRestantes(e.hoje, e.fimDoMes);

  const base = { receitasRestantes, saldoAtual, fixasAPagar, alvo, disponivel, dias, gastoHoje, gastoMes, saldoInicioMes, guardadoNoMes };
  if (disponivel < 0) return { ...base, alcancavel: false as const, falta: -disponivel };

  const limiteHoje = Math.floor((disponivel + gastoHoje) / dias);
  const restanteHoje = limiteHoje - gastoHoje;
  // orçamento variável do mês = o que já foi gasto + o que ainda dá para gastar
  const orcamentoMes = gastoMes + disponivel;
  const estado: "estourado" | "perto" | "ok" =
    restanteHoje < 0 ? "estourado" : gastoHoje >= limiteHoje * 0.8 && gastoHoje > 0 ? "perto" : "ok";
  return { ...base, alcancavel: true as const, limiteHoje, restanteHoje, orcamentoMes, estado };
}

export type ResultadoGastoDiario = ReturnType<typeof calcularGastoDiario>;
