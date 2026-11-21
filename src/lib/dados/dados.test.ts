import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { atualizarCategoria, criarCategoria, excluirCategoria, listarCategorias } from "./categorias";
import { ErroDados } from "./comum";
import { atualizarConta, criarConta, excluirConta, listarContas } from "./contas";
import { criarRecorrencia, excluirRecorrencia, lancarRecorrencia, listarRecorrencias } from "./recorrencias";
import {
  atualizarTransacao,
  categorizarEmLote,
  criarTransacao,
  excluirParcelamento,
  excluirTransacao,
  listarTransacoes,
} from "./transacoes";
import { criarUsuario, excluirUsuario, exportarDados } from "./usuarios";

let db: Db;

async function novoUsuario(email: string) {
  const uid = await criarUsuario(db, { nome: email, email, senhaHash: "hash-de-teste" });
  await criarConta(db, uid, { nome: `Conta ${email}`, tipo: "corrente", saldoCentavos: 100000 });
  const [c] = await listarContas(db, uid, "2026-12-31");
  const cats = await listarCategorias(db, uid);
  return { uid, conta: c!, despesa: cats.find((x) => x.nome === "Aluguel")!, receita: cats.find((x) => x.nome === "Salário")! };
}

beforeAll(async () => {
  const d = drizzle({ client: new PGlite(), schema, casing: "snake_case" });
  await migrate(d, { migrationsFolder: "drizzle" });
  db = d as unknown as Db;
});

describe("isolamento entre usuários", () => {
  let a: Awaited<ReturnType<typeof novoUsuario>>;
  let b: Awaited<ReturnType<typeof novoUsuario>>;
  let txB: { id: string };
  let recB: { id: string };

  beforeAll(async () => {
    a = await novoUsuario("a@exemplo.test");
    b = await novoUsuario("b@exemplo.test");
    const base = { contaId: b.conta.id, categoriaId: b.despesa.id, observacao: null };
    await criarTransacao(db, b.uid, { ...base, data: "2026-11-10", valorCentavos: -5000, descricao: "segredo de B", parcelas: 1 });
    await criarTransacao(db, b.uid, { ...base, data: "2026-11-11", valorCentavos: -3000, descricao: "parcelado B", parcelas: 3 });
    await criarRecorrencia(db, b.uid, { ...base, descricao: "aluguel B", valorCentavos: -150000, periodicidade: "mensal", proximaData: "2026-11-05" });
    txB = (await listarTransacoes(db, b.uid, { mes: "2026-11", texto: "segredo" }))[0]!;
    recB = (await listarRecorrencias(db, b.uid))[0]!;
  });

  async function estadoDeB() {
    return {
      contas: await listarContas(db, b.uid, "2026-12-31"),
      categorias: await listarCategorias(db, b.uid),
      transacoes: await listarTransacoes(db, b.uid, { mes: "2026-11" }),
      recorrencias: await listarRecorrencias(db, b.uid),
    };
  }

  it("A não lê dados de B", async () => {
    const contasA = await listarContas(db, a.uid, "2026-12-31");
    expect(contasA.map((c) => c.id)).toEqual([a.conta.id]);
    expect(await listarTransacoes(db, a.uid, { mes: "2026-11" })).toEqual([]);
    expect(await listarTransacoes(db, a.uid, { mes: "2026-11", contaId: b.conta.id })).toEqual([]);
    expect(await listarTransacoes(db, a.uid, { mes: "2026-11", categoriaId: b.despesa.id })).toEqual([]);
    expect(await listarRecorrencias(db, a.uid)).toEqual([]);
    const idsB = new Set((await listarCategorias(db, b.uid)).map((c) => c.id));
    expect((await listarCategorias(db, a.uid)).some((c) => idsB.has(c.id))).toBe(false);
    const exportado = JSON.stringify(await exportarDados(db, a.uid));
    expect(exportado).not.toContain("segredo de B");
    expect(exportado).not.toContain(b.conta.id);
    expect(exportado).not.toContain("hash-de-teste");
  });

  it("A não altera nem apaga dados de B", async () => {
    const antes = await estadoDeB();
    const dadosA = { contaId: a.conta.id, categoriaId: null, data: "2026-11-01", valorCentavos: -1, descricao: "x", observacao: null };
    await atualizarTransacao(db, a.uid, txB.id, dadosA);
    await excluirTransacao(db, a.uid, txB.id);
    await excluirParcelamento(db, a.uid, antes.transacoes.find((t) => t.grupoParcelas)!.grupoParcelas!);
    await categorizarEmLote(db, a.uid, [txB.id], a.despesa.id);
    await atualizarConta(db, a.uid, b.conta.id, { nome: "hackeada", tipo: "dinheiro", saldoCentavos: 0 });
    await excluirConta(db, a.uid, b.conta.id);
    await atualizarCategoria(db, a.uid, b.despesa.id, { nome: "hackeada", cor: "#000000" });
    await excluirCategoria(db, a.uid, b.despesa.id);
    await excluirRecorrencia(db, a.uid, recB.id);
    expect(await estadoDeB()).toEqual(antes);
  });

  it("A não lança nem referencia conta/categoria/recorrência de B", async () => {
    const base = { data: "2026-11-01", valorCentavos: -1, descricao: "x", observacao: null, parcelas: 1 };
    await expect(criarTransacao(db, a.uid, { ...base, contaId: b.conta.id, categoriaId: null })).rejects.toThrow(ErroDados);
    await expect(criarTransacao(db, a.uid, { ...base, contaId: a.conta.id, categoriaId: b.despesa.id })).rejects.toThrow(ErroDados);
    await expect(atualizarTransacao(db, a.uid, txB.id, { ...base, contaId: b.conta.id, categoriaId: null })).rejects.toThrow(ErroDados);
    await expect(categorizarEmLote(db, a.uid, [txB.id], b.despesa.id)).rejects.toThrow(ErroDados);
    await expect(
      criarRecorrencia(db, a.uid, { contaId: b.conta.id, categoriaId: null, descricao: "x", valorCentavos: -1, periodicidade: "mensal", proximaData: "2026-11-01" }),
    ).rejects.toThrow(ErroDados);
    await expect(lancarRecorrencia(db, a.uid, recB.id)).rejects.toThrow(ErroDados);
    await expect(criarCategoria(db, a.uid, { nome: "x", tipo: "despesa", cor: "#000000", paiId: b.despesa.id })).rejects.toThrow(ErroDados);
  });

  it("excluir a conta do usuário apaga todos os dados dele e só dele", async () => {
    await excluirUsuario(db, b.uid);
    const e = await exportarDados(db, b.uid);
    expect(e).toEqual({ usuario: undefined, contas: [], categorias: [], recorrencias: [], transacoes: [] });
    expect(await listarContas(db, a.uid, "2026-12-31")).toHaveLength(1);
  });
});

describe("um mês inteiro lançado dá o saldo correto", () => {
  it("saldo, parcelas e recorrência", async () => {
    const u = await novoUsuario("mes@exemplo.test"); // saldo de abertura R$ 1.000,00
    const base = { contaId: u.conta.id, observacao: null, parcelas: 1 };
    await criarTransacao(db, u.uid, { ...base, categoriaId: u.receita.id, data: "2026-11-05", valorCentavos: 500000, descricao: "Salário" });
    await criarTransacao(db, u.uid, { ...base, categoriaId: u.despesa.id, data: "2026-11-06", valorCentavos: -12345, descricao: "Mercado" });
    await criarTransacao(db, u.uid, { ...base, categoriaId: null, data: "2026-11-20", valorCentavos: -30000, descricao: "TV", parcelas: 3 });
    await criarRecorrencia(db, u.uid, { contaId: u.conta.id, categoriaId: u.despesa.id, descricao: "Aluguel", valorCentavos: -150000, periodicidade: "mensal", proximaData: "2026-11-10" });
    const [rec] = await listarRecorrencias(db, u.uid);
    await lancarRecorrencia(db, u.uid, rec!.id, 140000);

    const nov = await listarTransacoes(db, u.uid, { mes: "2026-11" });
    expect(nov.map((t) => t.valorCentavos).sort((x, y) => x - y)).toEqual([-140000, -12345, -10000, 500000]);
    expect((await listarTransacoes(db, u.uid, { mes: "2027-01" })).map((t) => `${t.parcelaAtual}/${t.parcelasTotal}`)).toEqual(["3/3"]);
    expect((await listarRecorrencias(db, u.uid))[0]!.proximaData).toBe("2026-12-10");

    // 1.000,00 + 5.000,00 - 123,45 - 100,00 (1ª parcela) - 1.400,00 = 4.376,55; parcelas futuras não entram ainda
    const [conta] = await listarContas(db, u.uid, "2026-11-30");
    expect(conta!.saldoAtual).toBe(437655);

    const tv = nov.find((t) => t.descricao === "TV")!;
    await excluirParcelamento(db, u.uid, tv.grupoParcelas!);
    expect(await listarTransacoes(db, u.uid, { mes: "2027-01" })).toEqual([]);

    // filtro por categoria pai inclui subcategorias
    const moradia = (await listarCategorias(db, u.uid)).find((c) => c.nome === "Moradia")!;
    expect(await listarTransacoes(db, u.uid, { mes: "2026-11", categoriaId: moradia.id })).toHaveLength(2);
    // texto com curinga é literal
    expect(await listarTransacoes(db, u.uid, { mes: "2026-11", texto: "%" })).toEqual([]);
  });
});
