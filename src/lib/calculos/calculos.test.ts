import { describe, expect, it } from "vitest";
import { hoje, limitesDoMes, ocorrenciasAte, proximaData, somarMeses, somarMesesAoMes } from "./datas";
import { faturaDaCompra, proximoDia, resumoDoCartao } from "./cartao";
import { consolidarCredito, FAIXAS_PADRAO, faixaDeUso, gastoNoCreditoNoMes, parcelasFuturasPorMes } from "./credito";
import { mesesRestantes, resumoObjetivo } from "./objetivos";
import { progressoOrcamentos } from "./orcamento";
import { gerarParcelas } from "./parcelas";
import { despesasPorCategoria, previstosAte, resumoDoMes, saldoDaConta } from "./resumo";
import { centavosParaTexto, formatarData, formatarReais, lerReais } from "../formato";

describe("datas", () => {
  it("soma meses limitando ao último dia", () => {
    expect(somarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(somarMeses("2028-01-31", 1)).toBe("2028-02-29");
    expect(somarMeses("2026-11-15", 3)).toBe("2027-02-15");
    expect(somarMesesAoMes("2026-01", -1)).toBe("2025-12");
  });
  it("próxima data por periodicidade", () => {
    expect(proximaData("2026-12-28", "semanal")).toBe("2027-01-04");
    expect(proximaData("2026-11-05", "mensal")).toBe("2026-12-05");
    expect(proximaData("2028-02-29", "anual")).toBe("2029-02-28");
  });
  it("ocorrências até o fim do mês", () => {
    expect(ocorrenciasAte("2026-11-03", "semanal", "2026-11-30")).toEqual(["2026-11-03", "2026-11-10", "2026-11-17", "2026-11-24"]);
    expect(ocorrenciasAte("2026-12-01", "mensal", "2026-11-30")).toEqual([]);
  });
  it("limites do mês e hoje em São Paulo", () => {
    expect(limitesDoMes("2026-02")).toEqual({ inicio: "2026-02-01", fim: "2026-02-28" });
    // 02:00 UTC do dia 22 ainda é dia 21 em São Paulo
    expect(hoje(new Date("2026-11-22T02:00:00Z"))).toBe("2026-11-21");
  });
});

describe("parcelas", () => {
  it("soma exata com sobra na primeira", () => {
    const p = gerarParcelas(-100000, 3, "2026-01-31");
    expect(p.map((x) => x.valorCentavos)).toEqual([-33334, -33333, -33333]);
    expect(p.reduce((s, x) => s + x.valorCentavos, 0)).toBe(-100000);
    expect(p.map((x) => x.data)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(p.map((x) => x.parcela)).toEqual([1, 2, 3]);
  });
  it("rejeita entrada inválida", () => {
    expect(() => gerarParcelas(100, 0, "2026-01-01")).toThrow();
    expect(() => gerarParcelas(10.5, 2, "2026-01-01")).toThrow();
  });
});

describe("resumo do mês", () => {
  const lancs = [
    { valorCentavos: 500000, data: "2026-11-05", categoriaId: "sal" },
    { valorCentavos: -150000, data: "2026-11-06", categoriaId: "aluguel" },
    { valorCentavos: -20000, data: "2026-11-10", categoriaId: "luz" },
    { valorCentavos: -5000, data: "2026-11-25", categoriaId: null, contaId: "c" },
  ];
  it("cartão é despesa na compra, não mexe no saldo; pagamento de fatura não é despesa", () => {
    const comCartao = [
      ...lancs,
      { valorCentavos: -7000, data: "2026-11-26", categoriaId: "luz", contaId: null }, // compra futura no cartão
      { valorCentavos: -9000, data: "2026-11-27", categoriaId: null, contaId: "c", transferenciaId: "t" }, // paga fatura
      { valorCentavos: 9000, data: "2026-11-27", categoriaId: null, contaId: null, transferenciaId: "t" },
    ];
    const r = resumoDoMes(comCartao, [], 1000000, "2026-11-21");
    expect(r.despesas).toBe(175000 + 7000);
    expect(r.receitas).toBe(500000);
    expect(r.saldoFimDoMes).toBe(1000000 - 5000 - 9000);
    expect(despesasPorCategoria(comCartao, [{ id: "luz", paiId: null }]).find((p) => p.categoriaId === null)!.total).toBe(5000);
  });
  it("receitas, despesas, saldo e projeção", () => {
    const previstos = [{ valorCentavos: -9990 }, { valorCentavos: 30000 }];
    const r = resumoDoMes(lancs, previstos, 1000000, "2026-11-21");
    expect(r).toEqual({
      receitas: 500000,
      despesas: 175000,
      saldoMes: 325000,
      previstoReceitas: 30000,
      previstoDespesas: 9990,
      // saldo hoje + lançamento futuro (dia 25) + previstos
      saldoFimDoMes: 1000000 - 5000 - 9990 + 30000,
    });
  });
  it("agrupa subcategoria no pai", () => {
    const cats = [
      { id: "moradia", paiId: null },
      { id: "aluguel", paiId: "moradia" },
      { id: "luz", paiId: "moradia" },
      { id: "sal", paiId: null },
    ];
    expect(despesasPorCategoria(lancs, cats)).toEqual([
      { categoriaId: "moradia", total: 170000 },
      { categoriaId: null, total: 5000 },
    ]);
  });
  it("previstos expande recorrências pendentes", () => {
    const recs = [{ id: "r", descricao: "Academia", valorCentavos: -1000, periodicidade: "semanal" as const, proximaData: "2026-11-20" }];
    expect(previstosAte(recs, "2026-11-30").map((p) => p.data)).toEqual(["2026-11-20", "2026-11-27"]);
  });
  it("saldo da conta manual soma lançamentos; do banco usa o informado", () => {
    expect(saldoDaConta({ origem: "manual", saldoCentavos: 1000 }, -300)).toBe(700);
    expect(saldoDaConta({ origem: "open_finance", saldoCentavos: 1000 }, -300)).toBe(1000);
  });
});

describe("cartão", () => {
  it("compra antes do fechamento cai na fatura do mês; no dia ou depois, na seguinte", () => {
    expect(faturaDaCompra("2026-11-02", 3, 10)).toEqual({ fechamento: "2026-11-03", vencimento: "2026-11-10" });
    expect(faturaDaCompra("2026-11-03", 3, 10)).toEqual({ fechamento: "2026-12-03", vencimento: "2026-12-10" });
    // fecha 25, vence 5 do mês seguinte
    expect(faturaDaCompra("2026-12-20", 25, 5)).toEqual({ fechamento: "2026-12-25", vencimento: "2027-01-05" });
    // dia 31 em fevereiro vira 28
    expect(faturaDaCompra("2026-02-10", 31, 8)).toEqual({ fechamento: "2026-02-28", vencimento: "2026-03-08" });
  });
  const c = { limiteTotalCentavos: 500000, limiteDisponivelCentavos: null, diaFechamento: 3, diaVencimento: 10 };
  it("faturas, pagamento quita a mais antiga, limite e uso", () => {
    const r = resumoDoCartao(c, [
      { data: "2026-10-20", valorCentavos: -30000 }, // fatura 10/11
      { data: "2026-11-15", valorCentavos: -10000 }, // fatura 10/12
      { data: "2026-12-15", valorCentavos: -10000 }, // parcela futura, fatura 10/01
      { data: "2026-11-10", valorCentavos: 35000 }, // pagamento: quita 10/11 e 5.000 da de 10/12
    ]);
    expect(r.faturas.map((f) => [f.vencimento, f.total, f.aberto])).toEqual([
      ["2026-11-10", 30000, 0],
      ["2026-12-10", 10000, 5000],
      ["2027-01-10", 10000, 10000],
    ]);
    expect(r.devido).toBe(15000);
    expect(r.disponivel).toBe(485000);
    expect(r.usoPct).toBe(3);
  });
  it("cartão do banco: fatura, vencimento e dívida vêm do banco, não do histórico", () => {
    // caso real (Inter via Open Finance): compras de 12 meses chegam, os pagamentos da fatura não
    const compras = ["2026-01-05", "2026-02-05", "2026-03-05"].map((data) => ({ data, valorCentavos: -50000 }));
    const banco = { ...c, limiteTotalCentavos: 298000, limiteDisponivelCentavos: 262990, faturaAbertaCentavos: 35010, faturaVencimento: "2026-12-07" };
    expect(resumoDoCartao(banco, compras)).toMatchObject({
      faturas: [{ fechamento: null, vencimento: "2026-12-07", total: 35010, aberto: 35010 }],
      devido: 35010,
      disponivel: 262990,
    });
    expect(resumoDoCartao({ ...banco, faturaAbertaCentavos: 0 }, compras).faturas).toEqual([]);
    // banco mandou o valor sem o vencimento: usa o dia de vencimento do cartão (10) a partir de hoje
    expect(resumoDoCartao({ ...banco, faturaVencimento: null }, compras, "2026-11-21").faturas).toEqual([
      { fechamento: null, vencimento: "2026-12-10", total: 35010, aberto: 35010 },
    ]);
    // banco não informou a fatura (Nubank): calcula pelas compras; fatura já vencida conta como paga
    const nubank = { ...c, diaFechamento: 3, diaVencimento: 10, limiteTotalCentavos: 565000, limiteDisponivelCentavos: 10341, faturaAbertaCentavos: 0, faturaVencimento: null };
    const comprasNu = [
      { data: "2026-10-20", valorCentavos: -9999 }, // fatura 10/11: já venceu
      { data: "2026-11-04", valorCentavos: -6659 }, // fatura 10/12
      { data: "2026-11-18", valorCentavos: -4000 }, // fatura 10/12
      { data: "2026-11-15", valorCentavos: 5000 }, // pagamento/estorno: ignorado
    ];
    expect(resumoDoCartao(nubank, comprasNu, "2026-11-21").faturas).toEqual([
      { fechamento: "2026-12-03", vencimento: "2026-12-10", total: 10659, aberto: 10659 },
    ]);
    expect(proximoDia("2026-11-05", 10)).toBe("2026-11-10");
    expect(proximoDia("2026-11-10", 10)).toBe("2026-11-10");
    expect(proximoDia("2027-01-31", 31)).toBe("2027-01-31");
    expect(proximoDia("2027-02-01", 31)).toBe("2027-02-28");
  });
  it("cartão manual: pagamento a mais vira crédito", () => {
    const r = resumoDoCartao(c, [{ data: "2026-11-01", valorCentavos: -1000 }, { data: "2026-11-05", valorCentavos: 1500 }]);
    expect(r.devido).toBe(-500);
    expect(r.disponivel).toBe(500500);
  });
});

describe("orçamento por categoria", () => {
  const cats = [
    { id: "alim", paiId: null },
    { id: "rest", paiId: "alim" },
    { id: "merc", paiId: "alim" },
    { id: "lazer", paiId: null },
  ];
  const lancs = [
    { valorCentavos: -30000, categoriaId: "rest" },
    { valorCentavos: -50000, categoriaId: "merc" },
    { valorCentavos: -9000, categoriaId: "lazer" },
    { valorCentavos: -100000, categoriaId: "lazer", transferenciaId: "t" }, // não conta
    { valorCentavos: 5000, categoriaId: "lazer" }, // estorno/receita não conta
    { valorCentavos: -1000, categoriaId: null },
  ];
  it("principal soma subcategorias; alerta aos 80% e estoura aos 100%", () => {
    const r = progressoOrcamentos(
      [
        { categoriaId: "alim", limiteCentavos: 80000 },
        { categoriaId: "rest", limiteCentavos: 37500 },
        { categoriaId: "lazer", limiteCentavos: 20000 },
        { categoriaId: "merc", limiteCentavos: 0 }, // 0 = sem limite
      ],
      lancs,
      cats,
    );
    expect(r.map((o) => [o.categoriaId, o.gasto, o.pct, o.estado])).toEqual([
      ["alim", 80000, 100, "estourado"],
      ["rest", 30000, 80, "alerta"],
      ["lazer", 9000, 45, "ok"],
    ]);
    expect(r[2]!.restante).toBe(11000);
  });
});

describe("crédito consolidado", () => {
  const f = FAIXAS_PADRAO;
  it("faixas: até 30% verde, até 60% amarela, acima vermelha", () => {
    expect([0, 30, 30.1, 60, 60.1, 100].map((p) => faixaDeUso(p, f))).toEqual(["verde", "verde", "amarela", "amarela", "vermelha", "vermelha"]);
    expect(faixaDeUso(50, { amarelaPct: 40, vermelhaPct: 80 })).toBe("amarela");
  });
  it("soma limites e disponíveis; percentual por cartão", () => {
    const r = consolidarCredito(
      [
        { id: "a", limiteTotalCentavos: 500000, disponivel: 450000 }, // 10%
        { id: "b", limiteTotalCentavos: 500000, disponivel: 150000 }, // 70%
      ],
      f,
    );
    expect(r).toMatchObject({ limiteTotal: 1000000, disponivel: 600000, usado: 400000, usoPct: 40, faixa: "amarela" });
    expect(r.porCartao.map((c) => [c.id, c.usoPct, c.faixa])).toEqual([["a", 10, "verde"], ["b", 70, "vermelha"]]);
    expect(consolidarCredito([], f)).toMatchObject({ limiteTotal: 0, usoPct: 0, faixa: "verde" });
  });
  it("gasto no crédito do mês e parcelas futuras por mês", () => {
    const base = { cartaoId: "a", grupoParcelas: null, transferenciaId: null };
    const lancs = [
      { ...base, data: "2026-11-05", valorCentavos: -10000 },
      { ...base, data: "2026-11-15", valorCentavos: -30000, grupoParcelas: "g" },
      { ...base, data: "2026-12-15", valorCentavos: -30000, grupoParcelas: "g" },
      { ...base, data: "2027-01-15", valorCentavos: -30000, grupoParcelas: "g" },
      { ...base, data: "2026-12-20", valorCentavos: -5000, grupoParcelas: "h" },
      { ...base, data: "2026-11-10", valorCentavos: 40000, transferenciaId: "t" }, // pagamento
      { ...base, cartaoId: null, data: "2026-11-06", valorCentavos: -99900 }, // conta, não cartão
    ];
    expect(gastoNoCreditoNoMes(lancs, "2026-11")).toBe(40000);
    expect(parcelasFuturasPorMes(lancs, "2026-11")).toEqual([
      { mes: "2026-12", total: 35000 },
      { mes: "2027-01", total: 30000 },
    ]);
  });
});

describe("objetivos", () => {
  it("meses restantes arredondam para cima e nunca são menos que 1", () => {
    expect(mesesRestantes("2026-11-21", "2027-07-21")).toBe(8);
    expect(mesesRestantes("2026-11-21", "2027-07-31")).toBe(9);
    expect(mesesRestantes("2026-11-21", "2026-11-30")).toBe(1);
    expect(mesesRestantes("2026-11-21", "2026-10-01")).toBe(1); // prazo vencido
  });
  const viagem = { valorAlvoCentavos: 600000, prazo: "2027-07-21", criadoEm: "2026-07-21" }; // 12 meses
  it("com prazo: aporte mensal e status pelo esperado até hoje", () => {
    // hoje = 4 meses depois de criado: esperado ~1/3 do alvo (2.000)
    const noRitmo = resumoObjetivo(viagem, [{ data: "2026-08-01", valorCentavos: 200000 }], "2026-11-21");
    expect(noRitmo).toMatchObject({ guardado: 200000, falta: 400000, pct: 33, meses: 8, aporteMensal: 50000, andamento: "no_ritmo" });
    expect(resumoObjetivo(viagem, [{ data: "2026-08-01", valorCentavos: 100000 }], "2026-11-21").andamento).toBe("atrasado");
    expect(resumoObjetivo(viagem, [{ data: "2026-08-01", valorCentavos: 300000 }], "2026-11-21").andamento).toBe("adiantado");
    // retirada (aporte negativo) reduz o guardado
    expect(resumoObjetivo(viagem, [{ data: "2026-08-01", valorCentavos: 300000 }, { data: "2026-09-01", valorCentavos: -100000 }], "2026-11-21").guardado).toBe(200000);
  });
  it("concluído quando chega no alvo", () => {
    expect(resumoObjetivo(viagem, [{ data: "2026-08-01", valorCentavos: 700000 }], "2026-11-21")).toMatchObject({ andamento: "concluido", falta: 0, pct: 100 });
  });
  it("sem prazo: data estimada pela média dos últimos 3 meses", () => {
    const reserva = { valorAlvoCentavos: 1000000, prazo: null, criadoEm: "2026-01-01" };
    const aportes = [
      { data: "2026-05-01", valorCentavos: 300000 }, // antigo: fora da média
      { data: "2026-08-06", valorCentavos: 100000 }, // agosto, setembro, outubro = 3 meses completos
      { data: "2026-09-06", valorCentavos: 100000 },
      { data: "2026-10-06", valorCentavos: 100000 },
      { data: "2026-11-10", valorCentavos: 100000 }, // mês atual (incompleto): fora da média
    ];
    // guardado 7.000, falta 3.000; média 1.000/mês -> 3 meses
    expect(resumoObjetivo(reserva, aportes, "2026-11-21")).toMatchObject({ andamento: "sem_prazo", mediaMensal: 100000, dataEstimada: "2027-02-21" });
    expect(resumoObjetivo(reserva, [{ data: "2026-05-01", valorCentavos: 1 }], "2026-11-21").dataEstimada).toBeNull();
    // objetivo novo, só com aporte deste mês: usa o mês atual como média
    expect(resumoObjetivo(reserva, [{ data: "2026-11-10", valorCentavos: 250000 }], "2026-11-21")).toMatchObject({ mediaMensal: 250000, dataEstimada: "2027-02-21" });
  });
});

describe("parcelas futuras de cartão do banco", () => {
  const base = { cartaoId: "mp", grupoParcelas: null, transferenciaId: null, parcelasTotal: 8 };
  it("projeta as parcelas que faltam a partir da última que chegou (caso Mercado Pago 8x)", () => {
    const lancs = [
      { ...base, data: "2026-09-12", valorCentavos: -15664, descricao: "LOJA ELETRO 1/8", parcelaAtual: 1 },
      { ...base, data: "2026-10-12", valorCentavos: -15664, descricao: "LOJA ELETRO 2/8", parcelaAtual: 2 },
      { ...base, data: "2026-11-12", valorCentavos: -15664, descricao: "LOJA ELETRO 3/8", parcelaAtual: 3 },
      { ...base, data: "2026-11-15", valorCentavos: -5000, descricao: "MERCADO", parcelaAtual: null, parcelasTotal: null },
    ];
    const r = parcelasFuturasPorMes(lancs, "2026-11");
    // faltam 4/8 a 8/8: dezembro a abril
    expect(r.map((p) => p.mes)).toEqual(["2026-12", "2027-01", "2027-02", "2027-03", "2027-04"]);
    expect(r.every((p) => p.total === 15664)).toBe(true);
    // compra com o mesmo nome em outro cartão é outra compra
    expect(parcelasFuturasPorMes([...lancs, { ...lancs[2]!, cartaoId: "nu" }], "2026-11")[0]!.total).toBe(31328);
  });
  it("não conta duas vezes a parcela futura que o banco já mandou", () => {
    const lancs = [
      { ...base, data: "2026-11-12", valorCentavos: -10000, descricao: "CURSO PARC 03/08", parcelaAtual: 3 },
      { ...base, data: "2026-12-12", valorCentavos: -10000, descricao: "CURSO PARC 04/08", parcelaAtual: 4 },
    ];
    const r = parcelasFuturasPorMes(lancs, "2026-11");
    expect(r.map((p) => [p.mes, p.total])).toEqual([["2026-12", 10000], ["2027-01", 10000], ["2027-02", 10000], ["2027-03", 10000], ["2027-04", 10000]]);
  });
});

describe("formato", () => {
  it("formata reais e datas no padrão brasileiro", () => {
    expect(formatarReais(123456).replace(/\s/g, " ")).toBe("R$ 1.234,56");
    expect(formatarReais(-5).replace(/\s/g, " ")).toBe("-R$ 0,05");
    expect(formatarData("2026-11-21")).toBe("21/11/2026");
  });
  it("lê valores digitados sem erro de arredondamento", () => {
    expect(lerReais("1.234,56")).toBe(123456);
    expect(lerReais("R$ 0,1")).toBe(10);
    expect(lerReais("12.5")).toBe(1250);
    expect(lerReais("1.234")).toBe(123400);
    expect(lerReais("19,99")).toBe(1999);
    expect(lerReais("-3")).toBe(-300);
    expect(lerReais("abc")).toBeNaN();
    expect(lerReais("1,234")).toBeNaN();
    expect(lerReais("")).toBeNaN();
    expect(centavosParaTexto(-123405)).toBe("-1234,05");
  });
});
