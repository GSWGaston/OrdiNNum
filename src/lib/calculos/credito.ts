// Uso do crédito (spec: Regras de cálculo, item 2). Uso% = (LimiteTotal - LimiteDisponível) / LimiteTotal * 100.

export type Faixas = { amarelaPct: number; vermelhaPct: number };
export const FAIXAS_PADRAO: Faixas = { amarelaPct: 30, vermelhaPct: 60 };
export type Faixa = "verde" | "amarela" | "vermelha";

/** Até amarelaPct: verde; até vermelhaPct: amarela; acima: vermelha. */
export const faixaDeUso = (usoPct: number, f: Faixas): Faixa =>
  usoPct > f.vermelhaPct ? "vermelha" : usoPct > f.amarelaPct ? "amarela" : "verde";

const uso = (limite: number, disponivel: number) => (limite > 0 ? ((limite - disponivel) / limite) * 100 : 0);

/** Soma de todos os cartões + percentual e faixa de cada um. */
export function consolidarCredito(cartoes: { id: string; limiteTotalCentavos: number; disponivel: number }[], f: Faixas) {
  const limiteTotal = cartoes.reduce((s, c) => s + c.limiteTotalCentavos, 0);
  const disponivel = cartoes.reduce((s, c) => s + c.disponivel, 0);
  const usoPct = uso(limiteTotal, disponivel);
  return {
    limiteTotal,
    disponivel,
    usado: limiteTotal - disponivel,
    usoPct,
    faixa: faixaDeUso(usoPct, f),
    porCartao: cartoes.map((c) => {
      const p = uso(c.limiteTotalCentavos, c.disponivel);
      return { id: c.id, usoPct: p, faixa: faixaDeUso(p, f) };
    }),
  };
}

type LancCartao = { data: string; valorCentavos: number; cartaoId: string | null; grupoParcelas: string | null; transferenciaId: string | null };
const compraNoCartao = (l: LancCartao) => !!l.cartaoId && !l.transferenciaId && l.valorCentavos < 0;

/** Total de compras no cartão (data da compra) no mês. */
export const gastoNoCreditoNoMes = (lancs: LancCartao[], mes: string) =>
  lancs.filter((l) => compraNoCartao(l) && l.data.startsWith(mes)).reduce((s, l) => s - l.valorCentavos, 0);

/** Parcelas de cartão que caem depois de `mesAtual`, somadas por mês (AAAA-MM), em ordem. */
export function parcelasFuturasPorMes(lancs: LancCartao[], mesAtual: string) {
  const porMes = new Map<string, number>();
  for (const l of lancs) {
    const mes = l.data.slice(0, 7);
    if (compraNoCartao(l) && l.grupoParcelas && mes > mesAtual) porMes.set(mes, (porMes.get(mes) ?? 0) - l.valorCentavos);
  }
  return [...porMes].map(([mes, total]) => ({ mes, total })).sort((a, b) => a.mes.localeCompare(b.mes));
}
