import { describe, expect, it } from "vitest";
import { gerarAlertas } from "@/lib/calculos/alertas";
import { categorizar } from "@/lib/calculos/regras";
import { cifrar, decifrar } from "@/lib/cripto";
import { converterContaPluggy, converterItemPluggy, converterTransacaoPluggy } from "./pluggy-converter";

describe("conversão Pluggy", () => {
  const t = (extra: Partial<Parameters<typeof converterTransacaoPluggy>[0]>) => ({ id: "x", description: "X", amount: 0, type: "DEBIT" as const, date: "2026-11-10T12:00:00Z", ...extra });
  it("conta: sinal pelo type; data no fuso de São Paulo", () => {
    expect(converterTransacaoPluggy(t({ description: " MERCADO ", amount: -75, date: "2026-11-21T02:00:00.000Z" }), "conta")).toMatchObject({ valorCentavos: -7500, descricao: "MERCADO", data: "2026-11-20" });
    expect(converterTransacaoPluggy(t({ amount: 8500, type: "CREDIT" }), "conta").valorCentavos).toBe(850000);
    expect(converterTransacaoPluggy(t({ amount: -10, category: "Same person transfer - PIX" }), "conta")).toMatchObject({ valorCentavos: -1000, ehTransferencia: true });
  });
  it("cartão: compra é saída qualquer que seja o sinal ou o type; pagamento e estorno são entrada", () => {
    // caso real do sandbox: SMART FIT veio com type CREDIT e entrou como receita antes da correção
    expect(converterTransacaoPluggy(t({ description: "SMART FIT ACADEMIA", amount: 89.9, type: "CREDIT" }), "cartao").valorCentavos).toBe(-8990);
    expect(converterTransacaoPluggy(t({ description: "NETFLIX", amount: -55.9, type: "DEBIT" }), "cartao").valorCentavos).toBe(-5590);
    expect(converterTransacaoPluggy(t({ description: "Pagamento recebido", amount: -150, type: "CREDIT", operationType: "PAGAMENTO_FATURA" }), "cartao")).toMatchObject({ valorCentavos: 15000, ehTransferencia: true });
    expect(converterTransacaoPluggy(t({ description: "ESTORNO LOJA X", amount: -40, type: "CREDIT" }), "cartao")).toMatchObject({ valorCentavos: 4000, ehTransferencia: false });
  });
  it("parcelas do cartão", () => {
    const p = converterTransacaoPluggy(t({ amount: 100, creditCardMetadata: { installmentNumber: 2, totalInstallments: 5 } }), "cartao");
    expect([p.parcelaAtual, p.parcelasTotal]).toEqual([2, 5]);
    const avista = converterTransacaoPluggy(t({ amount: 100, creditCardMetadata: { installmentNumber: 1, totalInstallments: 1 } }), "cartao");
    expect([avista.parcelaAtual, avista.parcelasTotal]).toEqual([null, null]);
  });
  it("contas e cartões", () => {
    expect(converterContaPluggy({ id: "1", type: "BANK", subtype: "SAVINGS_ACCOUNT", name: "Poupança", balance: 1234.565 })).toMatchObject({ tipo: "conta", subtipo: "poupanca", saldoCentavos: 123457 });
    expect(
      converterContaPluggy({ id: "2", type: "CREDIT", name: "Black", number: "5555666677778888", balance: 900, creditData: { brand: "VISA", creditLimit: 5000, availableCreditLimit: 4100, balanceCloseDate: null, balanceDueDate: "2026-12-10" } }),
    ).toMatchObject({ tipo: "cartao", nome: "Black •8888", bandeira: "VISA", limiteTotalCentavos: 500000, limiteDisponivelCentavos: 410000, diaFechamento: null, diaVencimento: 10 });
  });
  it("status do item", () => {
    expect(converterItemPluggy({ status: "UPDATED", connector: { name: "Nubank" }, consentExpiresAt: "2027-11-21T00:00:00Z", clientUserId: "u1" })).toMatchObject({ banco: "Nubank", status: "atualizado", erro: null, clientUserId: "u1" });
    expect(converterItemPluggy({ status: "LOGIN_ERROR", executionStatus: "INVALID_CREDENTIALS", error: { message: "Senha inválida" } })).toMatchObject({ status: "erro", erro: "Senha inválida" });
    expect(converterItemPluggy({ status: "OUTDATED", executionStatus: "USER_AUTHORIZATION_REVOKED" }).status).toBe("acao_necessaria");
  });
});

describe("regras de categorização", () => {
  const regras = [
    { padraoTexto: "uber", categoriaId: "transporte", prioridade: 0 },
    { padraoTexto: "uber eats", categoriaId: "restaurante", prioridade: 0 },
    { padraoTexto: "padaria", categoriaId: "mercado", prioridade: 0 },
    { padraoTexto: "pão", categoriaId: "lanche", prioridade: 5 },
  ];
  it("sem acento e sem maiúscula; mais específica ganha; prioridade manda", () => {
    expect(categorizar("UBER *TRIP", regras)).toBe("transporte");
    expect(categorizar("Uber  Eats pedido", regras)).toBe("restaurante");
    expect(categorizar("PADARIA PAO QUENTE", regras)).toBe("lanche"); // "pão" casa com "PAO" e tem prioridade 5
    expect(categorizar("FARMACIA", regras)).toBeNull();
  });
});

describe("alertas", () => {
  const base = { hoje: "2026-11-21", agora: new Date("2026-11-21T12:00:00Z"), gastoDiario: null, orcamentos: [], credito: null, aPagar: [], conexoes: [] };
  it("sem nada a avisar, lista vazia", () => {
    expect(gerarAlertas(base)).toEqual([]);
  });
  it("os quatro alertas da spec + conexões; urgentes primeiro", () => {
    const r = gerarAlertas({
      ...base,
      gastoDiario: { alcancavel: true, restanteHoje: -1500 },
      orcamentos: [
        { nome: "Lazer", pct: 85, estado: "alerta" },
        { nome: "Carro", pct: 110, estado: "estourado" },
        { nome: "Mercado", pct: 40, estado: "ok" },
      ],
      credito: { usoPct: 72.4, faixa: "vermelha" },
      aPagar: [
        { descricao: "Aluguel", data: "2026-11-20", valorCentavos: -180000 },
        { descricao: "Fatura Nubank", data: "2026-11-22", valorCentavos: -50000 },
        { descricao: "Academia", data: "2026-11-25", valorCentavos: -11990 }, // fora dos 3 dias
        { descricao: "Salário", data: "2026-11-21", valorCentavos: 650000 }, // receita não é alerta
      ],
      conexoes: [
        { banco: "Itaú", status: "erro", consentimentoAte: null },
        { banco: "Nubank", status: "atualizado", consentimentoAte: new Date("2026-11-30T00:00:00Z") },
        { banco: "Inter", status: "atualizado", consentimentoAte: new Date("2027-06-01T00:00:00Z") },
      ],
    }).map((x) => `${x.nivel}: ${x.texto.replace(/\s/g, " ")}`);
    expect(r).toEqual([
      "urgente: Gasto de hoje passou R$ 15,00 do limite",
      "urgente: Carro: limite do mês estourado (110%)",
      "urgente: Uso do crédito alto: 72% do limite",
      "urgente: Aluguel (R$ 1.800,00) atrasada desde 20/11/2026",
      "urgente: Itaú: a conexão precisa de atenção",
      "atencao: Lazer: 85% do limite do mês",
      "atencao: Fatura Nubank (R$ 500,00) vence amanhã",
      "atencao: Nubank: autorização vence em 30/11/2026; renove",
    ]);
  });
  it("meta impossível", () => {
    expect(gerarAlertas({ ...base, gastoDiario: { alcancavel: false, falta: 10000 } })[0]!.texto.replace(/\s/g, " ")).toBe("A meta do mês não fecha: faltam R$ 100,00");
  });
});

describe("criptografia", () => {
  it("cifra e decifra; cada cifra é diferente; adulterar quebra", () => {
    process.env.ENCRYPTION_KEY = "chave-de-teste";
    const a = cifrar("item-123");
    expect(a).not.toContain("item-123");
    expect(a).not.toBe(cifrar("item-123"));
    expect(decifrar(a)).toBe("item-123");
    const partes = a.split(":");
    partes[3] = Buffer.from("outro").toString("base64url");
    expect(() => decifrar(partes.join(":"))).toThrow();
  });
});
