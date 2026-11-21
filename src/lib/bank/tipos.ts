// Contrato com o agregador de Open Finance. O resto do app só conhece estes tipos (spec: BankProvider isola o agregador).

export type ItemBanco = {
  banco: string; // nome do conector, ex.: "Nubank"
  status: "atualizado" | "atualizando" | "erro" | "acao_necessaria";
  erro: string | null;
  consentimentoAte: Date | null;
  /** quem criou o item pelo widget (nosso id de usuário); null em itens do Meu Pluggy */
  clientUserId: string | null;
};

export type ContaBanco = {
  idExterno: string;
  nome: string;
} & (
  | { tipo: "conta"; subtipo: "corrente" | "poupanca"; saldoCentavos: number }
  | {
      tipo: "cartao";
      bandeira: string;
      limiteTotalCentavos: number;
      limiteDisponivelCentavos: number | null;
      diaFechamento: number | null;
      diaVencimento: number | null;
      faturaAbertaCentavos: number; // valor ainda não pago da fatura atual
      faturaVencimento: string | null;
    }
);

export type TransacaoBanco = {
  idExterno: string;
  data: string; // AAAA-MM-DD no fuso de São Paulo
  valorCentavos: number; // negativo = saída (vale para conta e cartão, como no resto do app)
  descricao: string;
  categoriaBanco: string | null;
  /** pagamento de fatura ou transferência entre contas próprias: não é receita nem despesa */
  ehTransferencia: boolean;
  parcelaAtual: number | null;
  parcelasTotal: number | null;
};

export interface BankProvider {
  readonly nome: "pluggy" | "fake";
  /** token curto para abrir o widget de conexão no navegador (null se o provedor não usa widget) */
  criarTokenConexao(o: { clientUserId: string; itemId?: string }): Promise<string | null>;
  buscarItem(itemId: string): Promise<ItemBanco>;
  listarContas(itemId: string): Promise<ContaBanco[]>;
  listarTransacoes(conta: Pick<ContaBanco, "idExterno" | "tipo">, desde: string): Promise<TransacaoBanco[]>;
  /** revoga o consentimento e apaga a conexão no agregador */
  excluirItem(itemId: string): Promise<void>;
}
