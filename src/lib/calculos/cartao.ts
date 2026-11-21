import { parcelasFuturasPorMes } from "./credito";
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
  faturaAbertaCentavos?: number | null;
  faturaVencimento?: string | null;
  limitePessoalCentavos?: number | null;
};

export type Fatura = { fechamento: string | null; vencimento: string; total: number; aberto: number };

/**
 * Faturas, devido e limite de um cartão a partir de todos os lançamentos dele (inclusive parcelas futuras).
 * Compras (negativas) entram na fatura pela data; pagamentos e estornos (positivos) quitam as faturas mais antigas primeiro.
 * Cartão manual: disponível = limite - faturas abertas - parcelas futuras.
 * Cartão do banco (tem disponível informado): fatura aberta, vencimento e dívida vêm do banco. O histórico não serve,
 * porque o Open Finance não manda os pagamentos de fatura do lado do cartão: tudo pareceria em aberto.
 */
/** Próxima data (a partir de `hoje`, inclusive) com o dia `dia` do mês, limitado ao último dia. */
export function proximoDia(hoje: string, dia: number) {
  const noMes = diaNoMes(hoje.slice(0, 7), dia);
  return noMes >= hoje ? noMes : diaNoMes(somarMesesAoMes(hoje.slice(0, 7), 1), dia);
}

type LancamentoCartao = {
  data: string;
  valorCentavos: number;
  grupoParcelas?: string | null;
  transferenciaId?: string | null;
  descricao?: string;
  parcelaAtual?: number | null;
  parcelasTotal?: number | null;
};

/**
 * Cartão do banco (tem disponível informado), conforme o que se viu com bancos reais:
 * - o disponível pode vir sobre o limite pessoal (Nubank com uso limitado no app) ou sobre o limite real (Inter).
 *   Com limite pessoal informado e disponível menor que ele, vale o pessoal; senão, o real.
 * - usado = limite - disponível. A fatura do mês = usado - parcelas dos próximos meses (o banco tira do limite o
 *   total da compra parcelada). O campo "fatura" do banco não é usado: no Inter ele não batia com a fatura real.
 */
export function resumoDoCartao(c: CartaoBase, lancamentos: LancamentoCartao[], hoje?: string) {
  const pessoal = c.limitePessoalCentavos ?? null;
  const referencia = pessoal ?? c.limiteTotalCentavos; // limite que o usuário quer acompanhar
  if (c.limiteDisponivelCentavos !== null) {
    const disp = c.limiteDisponivelCentavos;
    const base = pessoal !== null && disp <= pessoal ? "pessoal" : "cartao";
    const devido = Math.max(0, (base === "pessoal" ? pessoal! : c.limiteTotalCentavos) - disp);
    const parcelasFuturas = hoje
      ? parcelasFuturasPorMes(
          lancamentos.map((l) => ({ cartaoId: "c", grupoParcelas: null, transferenciaId: null, ...l })),
          hoje.slice(0, 7),
        ).reduce((s, p) => s + p.total, 0)
      : 0;
    const aberto = Math.max(0, devido - parcelasFuturas);
    // nem todo banco manda o vencimento: sem ele, usa o dia de vencimento do cartão
    const vencimento = c.faturaVencimento ?? (hoje ? proximoDia(hoje, c.diaVencimento) : null);
    const faturas: Fatura[] = aberto > 0 && vencimento ? [{ fechamento: null, vencimento, total: aberto, aberto }] : [];
    const usoPct = referencia > 0 ? (devido / referencia) * 100 : 0;
    return { faturas, devido, disponivel: referencia - devido, usoPct, base, parcelasFuturas };
  }
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
  const faturas: Fatura[] = [...porVencimento.values()]
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
    .map((f) => {
      const pago = Math.min(creditos, f.total);
      creditos -= pago;
      return { ...f, aberto: f.total - pago };
    });
  const devido = faturas.reduce((s, f) => s + f.aberto, 0) - creditos;
  const disponivel = referencia - devido;
  const usoPct = referencia > 0 ? (devido / referencia) * 100 : 0;
  return { faturas, devido, disponivel, usoPct, base: "cartao" as const, parcelasFuturas: 0 };
}
