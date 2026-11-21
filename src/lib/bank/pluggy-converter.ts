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
    };
  }
  return { idExterno: a.id, nome, tipo: "conta", subtipo: a.subtype === "SAVINGS_ACCOUNT" ? "poupanca" : "corrente", saldoCentavos: centavos(a.balance) };
}

const TRANSFERENCIA = /credit card payment|pagamento de fatura|same person transfer|mesma titularidade/i;

/**
 * Sinal pelo campo `type` (DEBIT = saída, CREDIT = entrada) e não pelo sinal de `amount`: no cartão a Pluggy usa
 * positivo = compra, e o sandbox às vezes contradiz isso. No app, saída é sempre negativa.
 */
export function converterTransacaoPluggy(t: TransacaoPluggy): TransacaoBanco {
  const valor = Math.abs(centavos(t.amount));
  const m = t.creditCardMetadata;
  return {
    idExterno: t.id,
    data: hoje(new Date(t.date)), // data vem em UTC; o dia que vale é o de São Paulo
    valorCentavos: t.type === "DEBIT" ? -valor : valor,
    descricao: t.description.trim(),
    categoriaBanco: t.category ?? null,
    ehTransferencia: t.operationType === "PAGAMENTO_FATURA" || TRANSFERENCIA.test(t.category ?? ""),
    parcelaAtual: m?.totalInstallments && m.totalInstallments > 1 ? (m.installmentNumber ?? null) : null,
    parcelasTotal: m?.totalInstallments && m.totalInstallments > 1 ? m.totalInstallments : null,
  };
}
