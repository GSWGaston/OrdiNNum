import { describe, expect, it } from "vitest";
import { calcularGastoDiario, diasRestantes, type EntradaGastoDiario, type LancamentoDia } from "./gastoDiario";

const l = (data: string, valorCentavos: number, extra: Partial<LancamentoDia> = {}): LancamentoDia => ({
  data,
  valorCentavos,
  contaId: "cc",
  cartaoId: null,
  transferenciaId: null,
  recorrenciaId: null,
  parcelaAtual: null,
  ...extra,
});

// 21/11, mês de 30 dias: 10 dias restantes contando hoje
const base: EntradaGastoDiario = {
  hoje: "2026-11-21",
  fimDoMes: "2026-11-30",
  meta: { modo: "saldo_final", valorCentavos: 50000 },
  contas: [{ id: "cc", tipo: "corrente", saldoAtual: 300000 }],
  lancamentosMes: [],
  previstos: [],
  dividaCartoes: 0,
};

describe("gasto diário", () => {
  it("dias restantes incluem hoje", () => {
    expect(diasRestantes("2026-11-21", "2026-11-30")).toBe(10);
    expect(diasRestantes("2026-11-30", "2026-11-30")).toBe(1);
  });

  it("terminar com Y: (receitas + saldo - fixas - Y) / dias", () => {
    const r = calcularGastoDiario({
      ...base,
      previstos: [{ valorCentavos: 100000 }, { valorCentavos: -180000 }],
      dividaCartoes: 20000,
    });
    // 1.000 + 3.000 - (1.800 + 200) - 500 = 1.500 -> 150/dia
    expect(r).toMatchObject({ alcancavel: true, disponivel: 150000, limiteHoje: 15000, restanteHoje: 15000, estado: "ok" });
  });

  it("economizar X usa o saldo do início do mês + X", () => {
    const r = calcularGastoDiario({
      ...base,
      meta: { modo: "economizar", valorCentavos: 50000 },
      lancamentosMes: [l("2026-11-05", 500000), l("2026-11-06", -250000, { recorrenciaId: "aluguel" })],
    });
    // início = 3.000 - 5.000 + 2.500 = 500; alvo = 1.000; disp = 3.000 - 1.000 = 2.000
    expect(r).toMatchObject({ saldoInicioMes: 50000, alvo: 100000, disponivel: 200000, limiteHoje: 20000 });
  });

  it("gasto de hoje não muda o limite de hoje; gastou menos, amanhã sobe", () => {
    const antes = calcularGastoDiario(base); // 2.500 / 10 = 250
    const depois = calcularGastoDiario({
      ...base,
      contas: [{ id: "cc", tipo: "corrente", saldoAtual: 290000 }],
      lancamentosMes: [l("2026-11-21", -10000)],
    });
    expect(antes).toMatchObject({ limiteHoje: 25000 });
    expect(depois).toMatchObject({ limiteHoje: 25000, gastoHoje: 10000, restanteHoje: 15000 });
    // amanhã: 2.400 / 9 = 266,66 (subiu porque hoje gastou 100 < 250)
    const amanha = calcularGastoDiario({ ...base, hoje: "2026-11-22", contas: [{ id: "cc", tipo: "corrente", saldoAtual: 290000 }], lancamentosMes: [l("2026-11-21", -10000)] });
    expect(amanha).toMatchObject({ limiteHoje: 26666, gastoHoje: 0 });
  });

  it("compra no cartão conta no dia da compra (pela dívida do cartão), sem contar de novo", () => {
    const r = calcularGastoDiario({
      ...base,
      lancamentosMes: [l("2026-11-21", -30000, { contaId: null, cartaoId: "cartao" })],
      dividaCartoes: 30000,
    });
    // dívida tira 300 do disponível (2.200), mas o limite de hoje soma o gasto de hoje de volta: 2.500/10
    expect(r).toMatchObject({ disponivel: 220000, limiteHoje: 25000, gastoHoje: 30000, restanteHoje: -5000, estado: "estourado" });
  });

  it("recorrência, parcela 2+ e transferência não são gasto variável", () => {
    const r = calcularGastoDiario({
      ...base,
      lancamentosMes: [
        l("2026-11-21", -180000, { recorrenciaId: "aluguel" }),
        l("2026-11-21", -5000, { parcelaAtual: 2 }),
        l("2026-11-21", -7000, { transferenciaId: "t" }),
        l("2026-11-21", -2000, { parcelaAtual: 1 }), // 1ª parcela de compra feita hoje: é gasto de hoje
      ],
    });
    expect(r.gastoHoje).toBe(2000);
  });

  it("transferência para investimento conta como já economizado", () => {
    const contas = [
      { id: "cc", tipo: "corrente", saldoAtual: 250000 },
      { id: "inv", tipo: "investimento", saldoAtual: 1000000 },
    ];
    const r = calcularGastoDiario({
      ...base,
      meta: { modo: "economizar", valorCentavos: 50000 },
      contas,
      lancamentosMes: [l("2026-11-10", -50000, { transferenciaId: "t" }), l("2026-11-10", 50000, { contaId: "inv", transferenciaId: "t" })],
    });
    // Mover dinheiro para o investimento não é economizar mais: o patrimônio total não mudou.
    // Início líquido 3.000; alvo = 3.000 + 500 - 500 já guardados = 3.000; líquido hoje 2.500 -> falta 500.
    // Sem descontar o guardado, o alvo seria 3.500 e cobraria a mesma economia duas vezes (falta 1.000).
    expect(r.guardadoNoMes).toBe(50000);
    expect(r).toMatchObject({ alvo: 300000, alcancavel: false, falta: 50000 });
  });

  it("meta inalcançável mostra quanto falta, nunca gasto negativo", () => {
    const r = calcularGastoDiario({ ...base, meta: { modo: "saldo_final", valorCentavos: 400000 } });
    expect(r).toMatchObject({ alcancavel: false, falta: 100000 });
    expect("limiteHoje" in r).toBe(false);
  });

  it("lançamento futuro na conta entra como receita/fixa; perto do limite fica amarelo", () => {
    const r = calcularGastoDiario({
      ...base,
      contas: [{ id: "cc", tipo: "corrente", saldoAtual: 280000 }],
      lancamentosMes: [l("2026-11-25", 100000), l("2026-11-28", -50000, { parcelaAtual: 3 }), l("2026-11-21", -20000)],
    });
    // 1.000 + 2.800 - 500 - 500 = 2.800 ; limite = (2.800 + 200)/10 = 300 ; gastou 200 (66%) -> ok
    expect(r).toMatchObject({ disponivel: 280000, limiteHoje: 30000, estado: "ok" });
    const perto = calcularGastoDiario({ ...base, lancamentosMes: [l("2026-11-21", -21000)], contas: [{ id: "cc", tipo: "corrente", saldoAtual: 279000 }] });
    expect(perto).toMatchObject({ limiteHoje: 25000, estado: "perto" });
  });
});
