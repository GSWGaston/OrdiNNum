import { limitesDoMes, somarMesesAoMes } from "./datas";

const diaNoMes = (mes: string, dia: number) =>
  `${mes}-${String(Math.min(dia, Number(limitesDoMes(mes).fim.slice(8)))).padStart(2, "0")}`;

/**
 * Fatura em que entra uma compra. Compra no dia do fechamento ou depois vai para a fatura seguinte.
 * Vencimento no mesmo mês do fechamento se o dia de vencimento for maior; senão, no mês seguinte.
 */
export function faturaDaCompra(data: string, diaFechamento: number, diaVencimento: number) {
  const mes = data.slice(0, 7);
  let fechamento = diaNoMes(mes, diaFechamento);
  if (data >= fechamento) fechamento = diaNoMes(somarMesesAoMes(mes, 1), diaFechamento);
  const mesF = fechamento.slice(0, 7);
  const vencimento = diaNoMes(diaVencimento > diaFechamento ? mesF : somarMesesAoMes(mesF, 1), diaVencimento);
  return { fechamento, vencimento };
}

export type CartaoBase = {
  limiteTotalCentavos: number;
  limiteDisponivelCentavos: number | null;
  diaFechamento: number;
  diaVencimento: number;
};

/**
 * Faturas, devido e limite de um cartão a partir de todos os lançamentos dele (inclusive parcelas futuras).
 * Compras (negativas) entram na fatura pela data; pagamentos e estornos (positivos) quitam as faturas mais antigas primeiro.
 * Cartão manual: disponível = limite - faturas abertas - parcelas futuras. Cartão do banco: usa o disponível informado.
 */
export function resumoDoCartao(c: CartaoBase, lancamentos: { data: string; valorCentavos: number }[]) {
  const porVencimento = new Map<string, { fechamento: string; vencimento: string; total: number }>();
  let creditos = 0;
  for (const l of lancamentos) {
    if (l.valorCentavos >= 0) {
      creditos += l.valorCentavos;
      continue;
    }
    const f = faturaDaCompra(l.data, c.diaFechamento, c.diaVencimento);
    const atual = porVencimento.get(f.vencimento) ?? { ...f, total: 0 };
    atual.total -= l.valorCentavos;
    porVencimento.set(f.vencimento, atual);
  }
  const faturas = [...porVencimento.values()]
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
    .map((f) => {
      const pago = Math.min(creditos, f.total);
      creditos -= pago;
      return { ...f, aberto: f.total - pago };
    });
  const devido = faturas.reduce((s, f) => s + f.aberto, 0) - creditos;
  const disponivel = c.limiteDisponivelCentavos ?? c.limiteTotalCentavos - devido;
  const usoPct = c.limiteTotalCentavos > 0 ? ((c.limiteTotalCentavos - disponivel) / c.limiteTotalCentavos) * 100 : 0;
  return { faturas, devido, disponivel, usoPct };
}
