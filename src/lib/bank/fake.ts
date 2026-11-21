// Banco simulado para testes e para usar o app sem credenciais da Pluggy. Dados fictícios.
import { hoje, somarDias } from "@/lib/calculos/datas";
import type { BankProvider, ContaBanco, ItemBanco, TransacaoBanco } from "./tipos";

export type DadosFake = { item: ItemBanco; contas: ContaBanco[]; transacoes: Record<string, TransacaoBanco[]> };

/** Um mês de movimento relativo a `dia` (conta corrente + cartão), com pagamento de fatura e parcela. */
export function dadosExemplo(dia = hoje()): DadosFake {
  const d = (n: number) => somarDias(dia, -n);
  const t = (idExterno: string, n: number, valorCentavos: number, descricao: string, extra: Partial<TransacaoBanco> = {}): TransacaoBanco => ({
    idExterno, data: d(n), valorCentavos, descricao, categoriaBanco: null, ehTransferencia: false, parcelaAtual: null, parcelasTotal: null, ...extra,
  });
  return {
    item: { banco: "Banco Simulado", status: "atualizado", erro: null, consentimentoAte: new Date(`${somarDias(dia, 360)}T00:00:00Z`), clientUserId: null },
    contas: [
      { idExterno: "cc-1", nome: "Conta Simulada", tipo: "conta", subtipo: "corrente", saldoCentavos: 234567 },
      { idExterno: "cartao-1", nome: "Cartão Simulado •1234", tipo: "cartao", bandeira: "Mastercard", limiteTotalCentavos: 300000, limiteDisponivelCentavos: 241010, diaFechamento: null, diaVencimento: 10 },
    ],
    transacoes: {
      "cc-1": [
        t("t1", 20, 520000, "SALARIO EMPRESA EXEMPLO"),
        t("t2", 18, -150000, "ALUGUEL APTO"),
        t("t3", 12, -8990, "PADARIA PAO QUENTE"),
        t("t4", 10, -45000, "PAGAMENTO FATURA CARTAO", { categoriaBanco: "Credit card payment", ehTransferencia: true }),
        t("t5", 3, -6350, "UBER *TRIP"),
      ],
      "cartao-1": [
        t("c1", 15, -12990, "IFOOD *RESTAURANTE"),
        t("c2", 8, -20000, "LOJA ELETRO 2/5", { parcelaAtual: 2, parcelasTotal: 5 }),
        t("c3", 2, -25000, "MERCADO BOM PRECO"),
        t("c4", 10, 45000, "PAGAMENTO RECEBIDO", { ehTransferencia: true }),
      ],
    },
  };
}

export class FakeProvider implements BankProvider {
  readonly nome = "fake" as const;
  /** `dados` mutável de propósito: os testes alteram para simular o banco mudando entre sincronizações. */
  constructor(public dados: DadosFake = dadosExemplo()) {}
  async criarTokenConexao() {
    return null;
  }
  async buscarItem() {
    return this.dados.item;
  }
  async listarContas() {
    return this.dados.contas;
  }
  async listarTransacoes(conta: { idExterno: string }, desde: string) {
    return (this.dados.transacoes[conta.idExterno] ?? []).filter((t) => t.data >= desde);
  }
  async excluirItem() {}
}
