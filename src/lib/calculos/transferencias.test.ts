import { describe, expect, it } from "vitest";
import { parearTransferencias, type Candidato } from "./transferencias";

const l = (id: string, data: string, valorCentavos: number, onde: { contaId?: string; cartaoId?: string }): Candidato => ({
  id,
  data,
  valorCentavos,
  contaId: onde.contaId ?? null,
  cartaoId: onde.cartaoId ?? null,
});

describe("pareamento de transferências", () => {
  it("Pix do Inter que paga a fatura do Nubank (caso real) vira um par", () => {
    const r = parearTransferencias([l("pix", "2026-11-06", -20451, { contaId: "inter" }), l("pag", "2026-11-06", 20451, { cartaoId: "nubank" })]);
    expect(r).toEqual([["pix", "pag"]]);
  });
  it("conta para conta com até 3 dias; mais longe não; mesma conta não", () => {
    expect(parearTransferencias([l("a", "2026-11-01", -5000, { contaId: "inter" }), l("b", "2026-11-04", 5000, { contaId: "nu" })])).toEqual([["a", "b"]]);
    expect(parearTransferencias([l("a", "2026-11-01", -5000, { contaId: "inter" }), l("b", "2026-11-05", 5000, { contaId: "nu" })])).toEqual([]);
    expect(parearTransferencias([l("a", "2026-11-01", -5000, { contaId: "inter" }), l("b", "2026-11-01", 5000, { contaId: "inter" })])).toEqual([]);
  });
  it("valor diferente não pareia; cada entrada só serve a um par; pega a data mais próxima", () => {
    expect(parearTransferencias([l("a", "2026-11-01", -5000, { contaId: "inter" }), l("b", "2026-11-01", 5001, { contaId: "nu" })])).toEqual([]);
    const r = parearTransferencias([
      l("s1", "2026-11-01", -1000, { contaId: "inter" }),
      l("s2", "2026-11-05", -1000, { contaId: "inter" }),
      l("e1", "2026-11-02", 1000, { contaId: "nu" }),
      l("e2", "2026-11-05", 1000, { contaId: "nu" }),
    ]);
    expect(r).toEqual([["s1", "e1"], ["s2", "e2"]]);
  });
  it("cartão não é origem de transferência (compra de mesmo valor que um Pix recebido não pareia)", () => {
    expect(parearTransferencias([l("compra", "2026-11-01", -5000, { cartaoId: "nu" }), l("pix", "2026-11-01", 5000, { contaId: "inter" })])).toEqual([]);
  });
});
