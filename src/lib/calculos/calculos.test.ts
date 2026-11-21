import { describe, expect, it } from "vitest";
import { hoje, limitesDoMes, ocorrenciasAte, proximaData, somarMeses, somarMesesAoMes } from "./datas";
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
    { valorCentavos: -5000, data: "2026-11-25", categoriaId: null },
  ];
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
