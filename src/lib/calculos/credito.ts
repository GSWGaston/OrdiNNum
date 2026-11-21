import { somarMesesAoMes } from "./datas";

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

type LancCartao = {
  data: string;
  valorCentavos: number;
  cartaoId: string | null;
  grupoParcelas: string | null;
  transferenciaId: string | null;
  descricao?: string;
  parcelaAtual?: number | null;
  parcelasTotal?: number | null;
};
const compraNoCartao = (l: LancCartao) => !!l.cartaoId && !l.transferenciaId && l.valorCentavos < 0;

/** Total de compras no cartão (data da compra) no mês. */
export const gastoNoCreditoNoMes = (lancs: LancCartao[], mes: string) =>
  lancs.filter((l) => compraNoCartao(l) && l.data.startsWith(mes)).reduce((s, l) => s - l.valorCentavos, 0);

// "LOJA X 3/8", "LOJA X PARC 03/08" -> "loja x"
const semParcela = (d: string) =>
  d
    .replace(/\s*(parc(ela)?\.?\s*)?\d{1,2}\s*\/\s*\d{1,2}\s*$/i, "")
    .trim()
    .toLowerCase();

/**
 * Parcelas de cartão que caem depois de `mesAtual`, somadas por mês (AAAA-MM), em ordem.
 * - Parcelamento lançado no app: as parcelas futuras já existem (grupo_parcelas).
 * - Parcelamento vindo do banco: só chegam as parcelas já cobradas (ex.: 3/8). As que faltam são projetadas a partir
 *   da última parcela conhecida de cada compra, uma por mês, com o mesmo valor.
 */
// shortcut: duas compras iguais (mesma descrição, valor e nº de parcelas) no mesmo cartão viram uma só na projeção;
// usar o id da compra quando o banco passar a mandar (creditCardMetadata.purchaseDate/billId).
export function parcelasFuturasPorMes(lancs: LancCartao[], mesAtual: string) {
  const porMes = new Map<string, number>();
  const soma = (mes: string, v: number) => porMes.set(mes, (porMes.get(mes) ?? 0) + v);
  const ultima = new Map<string, LancCartao & { parcelaAtual: number; parcelasTotal: number }>();
  for (const l of lancs) {
    if (!compraNoCartao(l)) continue;
    const mes = l.data.slice(0, 7);
    if (l.grupoParcelas) {
      if (mes > mesAtual) soma(mes, -l.valorCentavos);
      continue;
    }
    if (!l.parcelaAtual || !l.parcelasTotal || l.parcelasTotal < 2) continue;
    if (mes > mesAtual) soma(mes, -l.valorCentavos); // parcela futura que o banco já mandou
    const chave = `${l.cartaoId}|${semParcela(l.descricao ?? "")}|${-l.valorCentavos}|${l.parcelasTotal}`;
    const atual = ultima.get(chave);
    if (!atual || l.parcelaAtual > atual.parcelaAtual) ultima.set(chave, { ...l, parcelaAtual: l.parcelaAtual, parcelasTotal: l.parcelasTotal });
  }
  for (const l of ultima.values())
    for (let k = 1; k <= l.parcelasTotal - l.parcelaAtual; k++) {
      const mes = somarMesesAoMes(l.data.slice(0, 7), k);
      if (mes > mesAtual) soma(mes, -l.valorCentavos);
    }
  return [...porMes].map(([mes, total]) => ({ mes, total })).sort((a, b) => a.mes.localeCompare(b.mes));
}
