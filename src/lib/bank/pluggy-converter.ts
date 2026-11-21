// Conversão pura dos formatos da Pluggy para os tipos do app (testável sem rede).
import { hoje } from "@/lib/calculos/datas";
import type { ContaBanco, ItemBanco, TransacaoBanco } from "./tipos";

export type ItemPluggy = {
  status: string;
  executionStatus?: string;
  error?: { message?: string } | null;
  consentExpiresAt?: string | null;
  connector?: { name?: string } | null;
  clientUserId?: string | null;
};

export type ContaPluggy = {
  id: string;
  type: "BANK" | "CREDIT";
  subtype?: string;
  name: string;
  marketingName?: string | null;
  number?: string | null;
  balance: number;
  creditData?: {
    brand?: string | null;
    creditLimit?: number | null;
    availableCreditLimit?: number | null;
    balanceCloseDate?: string | null;
    balanceDueDate?: string | null;
  } | null;
};

export type TransacaoPluggy = {
  id: string;
  description: string;
  amount: number;
  type: "DEBIT" | "CREDIT";
  date: string;
  category?: string | null;
  operationType?: string | null;
  creditCardMetadata?: { installmentNumber?: number | null; totalInstallments?: number | null } | null;
};

const centavos = (reais: number) => Math.round(reais * 100);
const diaDe = (iso?: string | null) => (iso ? Number(iso.slice(8, 10)) || null : null);

export function converterItemPluggy(i: ItemPluggy): ItemBanco {
  const exec = i.executionStatus ?? "";
  const status: ItemBanco["status"] =
    i.status === "UPDATED"
      ? "atualizado"
      : i.status === "UPDATING"
        ? "atualizando"
        : i.status === "WAITING_USER_INPUT" || exec.startsWith("USER_AUTHORIZATION") || exec === "ACCOUNT_NEEDS_ACTION"
          ? "acao_necessaria"
          : "erro";
  return {
    banco: i.connector?.name ?? "Banco",
    status,
    erro: status === "erro" || status === "acao_necessaria" ? (i.error?.message ?? exec ?? i.status) : null,
    consentimentoAte: i.consentExpiresAt ? new Date(i.consentExpiresAt) : null,
    clientUserId: i.clientUserId ?? null,
  };
}

export function converterContaPluggy(a: ContaPluggy): ContaBanco {
  const nome = a.marketingName || a.name;
  if (a.type === "CREDIT") {
    const c = a.creditData ?? {};
    return {
      idExterno: a.id,
      nome: a.number ? `${nome} •${a.number.slice(-4)}` : nome,
      tipo: "cartao",
      bandeira: c.brand ?? "Outra",
      limiteTotalCentavos: centavos(c.creditLimit ?? 0),
      limiteDisponivelCentavos: c.availableCreditLimit == null ? null : centavos(c.availableCreditLimit),
      diaFechamento: diaDe(c.balanceCloseDate), // Open Finance não informa: fica o que o usuário definir
      diaVencimento: diaDe(c.balanceDueDate),
      // para cartão, `balance` é o que falta pagar da fatura atual (negativo = pagou a mais)
      faturaAbertaCentavos: Math.max(0, centavos(a.balance)),
      faturaVencimento: c.balanceDueDate ? c.balanceDueDate.slice(0, 10) : null,
    };
  }
  return { idExterno: a.id, nome, tipo: "conta", subtipo: a.subtype === "SAVINGS_ACCOUNT" ? "poupanca" : "corrente", saldoCentavos: centavos(a.balance) };
}

const TRANSFERENCIA = /credit card payment|pagamento de fatura|same person transfer|mesma titularidade/i;

const ESTORNO = /estorno|reembolso|cashback|devolu[cç][aã]o|cr[eé]dito de/i;

/**
 * No app, saída é sempre negativa.
 * - Conta: sinal pelo `type` (DEBIT = saída, CREDIT = entrada).
 * - Cartão: nem o sinal de `amount` nem o `type` são confiáveis (docs dizem positivo = compra; o sandbox manda
 *   compra com type CREDIT e às vezes amount negativo). Então: tudo é compra, menos pagamento de fatura e estorno.
 */
export function converterTransacaoPluggy(t: TransacaoPluggy, tipoConta: "conta" | "cartao"): TransacaoBanco {
  const valor = Math.abs(centavos(t.amount));
  const m = t.creditCardMetadata;
  const ehTransferencia = t.operationType === "PAGAMENTO_FATURA" || TRANSFERENCIA.test(t.category ?? "");
  const entrada = tipoConta === "conta" ? t.type === "CREDIT" : ehTransferencia || ESTORNO.test(`${t.description} ${t.category ?? ""}`);
  return {
    idExterno: t.id,
    data: hoje(new Date(t.date)), // data vem em UTC; o dia que vale é o de São Paulo
    valorCentavos: entrada ? valor : -valor,
    descricao: t.description.trim(),
    categoriaBanco: t.category ?? null,
    ehTransferencia,
    parcelaAtual: m?.totalInstallments && m.totalInstallments > 1 ? (m.installmentNumber ?? null) : null,
    parcelasTotal: m?.totalInstallments && m.totalInstallments > 1 ? m.totalInstallments : null,
  };
}
