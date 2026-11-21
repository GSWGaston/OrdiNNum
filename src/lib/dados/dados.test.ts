import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { atualizarCartao, criarCartao, excluirCartao, listarCartoes, pagarFatura } from "./cartoes";
import { atualizarCategoria, criarCategoria, excluirCategoria, listarCategorias } from "./categorias";
import { ErroDados } from "./comum";
import { atualizarConta, criarConta, excluirConta, listarContas, transferir } from "./contas";
import {
  atualizarRecorrencia,
  criarRecorrencia,
  definirAutomatica,
  excluirRecorrencia,
  lancarRecorrencia,
  lancarVencidas,
  listarRecorrencias,
  pularOcorrencia,
} from "./recorrencias";
import {
  atualizarTransacao,
  categorizarEmLote,
  criarTransacao,
  excluirParcelamento,
  excluirTransacao,
  listarTransacoes,
} from "./transacoes";
import { definirMeta, gastoDiarioDoUsuario, metaVigente } from "./metas";
import { definirOrcamento, orcamentosVigentes } from "./orcamentos";
import { definirFaixas, resumoCredito } from "./credito";
import { aportar, arquivarObjetivo, atualizarObjetivo, criarObjetivo, excluirAporte, excluirObjetivo, listarObjetivos, reservadoEmObjetivos } from "./objetivos";
import { FakeProvider, dadosExemplo } from "@/lib/bank/fake";
import { criarConexao, desconectar, itemIdDaConexao, listarConexoes, registrarItem, sincronizarConexao } from "./conexoes";
import { aplicarRegrasSemCategoria, criarRegra, listarRegras } from "./regras";
import { limparFalhas, loginBloqueado, MAX_FALHAS, registrarFalha } from "./tentativas";
import { criarUsuario, excluirUsuario, exportarDados } from "./usuarios";
import { resumoDoMes } from "@/lib/calculos/resumo";

let db: Db;

async function novoUsuario(email: string) {
  const uid = await criarUsuario(db, { nome: email, email, senhaHash: "hash-de-teste" });
  await criarConta(db, uid, { nome: `Conta ${email}`, tipo: "corrente", saldoCentavos: 100000 });
  const [c] = await listarContas(db, uid, "2026-12-31");
  await criarCartao(db, uid, { nome: `Cartão ${email}`, bandeira: "Visa", limiteTotalCentavos: 500000, diaFechamento: 3, diaVencimento: 10 });
  const [cartao] = await listarCartoes(db, uid);
  const cats = await listarCategorias(db, uid);
  return { uid, conta: c!, cartao: cartao!, despesa: cats.find((x) => x.nome === "Aluguel")!, receita: cats.find((x) => x.nome === "Salário")! };
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
    const base = { contaId: b.conta.id, cartaoId: null, categoriaId: b.despesa.id, observacao: null };
    await criarTransacao(db, b.uid, { ...base, data: "2026-11-10", valorCentavos: -5000, descricao: "segredo de B", parcelas: 1 });
    await criarTransacao(db, b.uid, { ...base, data: "2026-11-11", valorCentavos: -3000, descricao: "parcelado B", parcelas: 3 });
    await criarTransacao(db, b.uid, { ...base, contaId: null, cartaoId: b.cartao.id, data: "2026-11-12", valorCentavos: -7000, descricao: "cartão B", parcelas: 1 });
    await pagarFatura(db, b.uid, { cartaoId: b.cartao.id, contaId: b.conta.id, valorCentavos: 7000, data: "2026-11-13" });
    await criarRecorrencia(db, b.uid, { contaId: b.conta.id, categoriaId: b.despesa.id, descricao: "aluguel B", valorCentavos: -150000, periodicidade: "mensal", proximaData: "2026-11-05" });
    txB = (await listarTransacoes(db, b.uid, { mes: "2026-11", texto: "segredo" }))[0]!;
    recB = (await listarRecorrencias(db, b.uid))[0]!;
  });

  async function estadoDeB() {
    return {
      contas: await listarContas(db, b.uid, "2026-12-31"),
      cartoes: await listarCartoes(db, b.uid),
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
    expect((await listarCartoes(db, a.uid)).map((c) => c.id)).toEqual([a.cartao.id]);
    expect(await listarTransacoes(db, a.uid, { mes: "2026-11", contaId: b.cartao.id })).toEqual([]);
    const idsB = new Set((await listarCategorias(db, b.uid)).map((c) => c.id));
    expect((await listarCategorias(db, a.uid)).some((c) => idsB.has(c.id))).toBe(false);
    const exportado = JSON.stringify(await exportarDados(db, a.uid));
    expect(exportado).not.toContain("segredo de B");
    expect(exportado).not.toContain(b.conta.id);
    expect(exportado).not.toContain(b.cartao.id);
    expect(exportado).not.toContain("hash-de-teste");
  });

  it("A não altera nem apaga dados de B", async () => {
    const antes = await estadoDeB();
    const dadosA = { contaId: a.conta.id, cartaoId: null, categoriaId: null, data: "2026-11-01", valorCentavos: -1, descricao: "x", observacao: null };
    await atualizarTransacao(db, a.uid, txB.id, dadosA);
    await excluirTransacao(db, a.uid, txB.id);
    await excluirParcelamento(db, a.uid, antes.transacoes.find((t) => t.grupoParcelas)!.grupoParcelas!);
    await categorizarEmLote(db, a.uid, [txB.id], a.despesa.id);
    await atualizarConta(db, a.uid, b.conta.id, { nome: "hackeada", tipo: "dinheiro", saldoCentavos: 0 });
    await excluirConta(db, a.uid, b.conta.id);
    await atualizarCartao(db, a.uid, b.cartao.id, { nome: "hackeado", bandeira: "x", limiteTotalCentavos: 1, diaFechamento: 1, diaVencimento: 1 });
    await excluirCartao(db, a.uid, b.cartao.id);
    for (const t of antes.transacoes) await excluirTransacao(db, a.uid, t.id);
    await atualizarCategoria(db, a.uid, b.despesa.id, { nome: "hackeada", cor: "#000000" });
    await excluirCategoria(db, a.uid, b.despesa.id);
    await excluirRecorrencia(db, a.uid, recB.id);
    await definirAutomatica(db, a.uid, recB.id, true);
    await expect(pularOcorrencia(db, a.uid, recB.id)).rejects.toThrow(ErroDados);
    const recA = { contaId: a.conta.id, categoriaId: null, descricao: "hack", valorCentavos: -1, periodicidade: "mensal" as const, proximaData: "2030-01-01" };
    await atualizarRecorrencia(db, a.uid, recB.id, recA);
    await expect(atualizarRecorrencia(db, a.uid, recB.id, { ...recA, contaId: b.conta.id })).rejects.toThrow(ErroDados);
    await lancarVencidas(db, a.uid, "2027-12-31");
    expect(await estadoDeB()).toEqual(antes);
  });

  it("A não lança nem referencia conta/categoria/recorrência de B", async () => {
    const base = { data: "2026-11-01", valorCentavos: -1, descricao: "x", observacao: null, parcelas: 1, cartaoId: null };
    await expect(criarTransacao(db, a.uid, { ...base, contaId: null, cartaoId: b.cartao.id, categoriaId: null })).rejects.toThrow(ErroDados);
    await expect(criarTransacao(db, a.uid, { ...base, contaId: null, categoriaId: null })).rejects.toThrow(ErroDados);
    await expect(pagarFatura(db, a.uid, { cartaoId: b.cartao.id, contaId: a.conta.id, valorCentavos: 1, data: "2026-11-01" })).rejects.toThrow(ErroDados);
    await expect(pagarFatura(db, a.uid, { cartaoId: a.cartao.id, contaId: b.conta.id, valorCentavos: 1, data: "2026-11-01" })).rejects.toThrow(ErroDados);
    const tr = { valorCentavos: 1, data: "2026-11-01", descricao: "" };
    await expect(transferir(db, a.uid, { ...tr, deContaId: a.conta.id, paraContaId: b.conta.id })).rejects.toThrow(ErroDados);
    await expect(transferir(db, a.uid, { ...tr, deContaId: b.conta.id, paraContaId: a.conta.id })).rejects.toThrow(ErroDados);
    await expect(transferir(db, a.uid, { ...tr, deContaId: a.conta.id, paraContaId: a.conta.id })).rejects.toThrow(ErroDados);
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
    expect(e).toEqual({ usuario: undefined, contas: [], cartoes: [], categorias: [], recorrencias: [], metas: [], orcamentos: [], objetivos: [], aportes: [], regras: [], conexoes: [], transacoes: [] });
    expect(await listarContas(db, a.uid, "2026-12-31")).toHaveLength(1);
  });
});

describe("um mês inteiro lançado dá o saldo correto", () => {
  it("saldo, parcelas e recorrência", async () => {
    const u = await novoUsuario("mes@exemplo.test"); // saldo de abertura R$ 1.000,00
    const base = { contaId: u.conta.id, cartaoId: null, observacao: null, parcelas: 1 };
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

  it("transferência move saldo entre contas e não é receita nem despesa", async () => {
    const u = await novoUsuario("transf@exemplo.test"); // conta com R$ 1.000,00
    await criarConta(db, u.uid, { nome: "Zz Poupança", tipo: "poupanca", saldoCentavos: 0 });
    const poup = (await listarContas(db, u.uid, "2026-12-31")).find((c) => c.nome === "Zz Poupança")!;
    await transferir(db, u.uid, { deContaId: u.conta.id, paraContaId: poup.id, valorCentavos: 30000, data: "2026-11-10", descricao: "" });
    const saldos = Object.fromEntries((await listarContas(db, u.uid, "2026-12-31")).map((c) => [c.id, c.saldoAtual]));
    expect([saldos[u.conta.id], saldos[poup.id]]).toEqual([70000, 30000]);
    const lancs = await listarTransacoes(db, u.uid, { mes: "2026-11" });
    expect(lancs.map((l) => l.descricao)).toEqual(["Transferência", "Transferência"]);
    const r = resumoDoMes(lancs, [], 100000, "2026-11-30");
    expect([r.receitas, r.despesas]).toEqual([0, 0]);
    await excluirTransacao(db, u.uid, lancs[0]!.id);
    expect(await listarTransacoes(db, u.uid, { mes: "2026-11" })).toEqual([]);
  });

  it("cartão: compra não mexe no saldo da conta; pagar fatura sim, e o par se apaga junto", async () => {
    const u = await novoUsuario("cartao@exemplo.test"); // conta com R$ 1.000,00, cartão fecha 3 vence 10
    const noCartao = { contaId: null, cartaoId: u.cartao.id, categoriaId: null, observacao: null, descricao: "compra" };
    await criarTransacao(db, u.uid, { ...noCartao, data: "2026-11-05", valorCentavos: -60000, parcelas: 3 }); // faturas dez, jan, fev
    let [cartao] = await listarCartoes(db, u.uid);
    expect(cartao!.devido).toBe(60000);
    expect(cartao!.disponivel).toBe(440000);
    expect((await listarContas(db, u.uid, "2027-12-31"))[0]!.saldoAtual).toBe(100000);

    await pagarFatura(db, u.uid, { cartaoId: u.cartao.id, contaId: u.conta.id, valorCentavos: 20000, data: "2026-12-10" });
    [cartao] = await listarCartoes(db, u.uid);
    expect(cartao!.faturas.map((f) => f.aberto)).toEqual([0, 20000, 20000]);
    expect((await listarContas(db, u.uid, "2027-12-31"))[0]!.saldoAtual).toBe(80000);

    const pagamento = (await listarTransacoes(db, u.uid, { mes: "2026-12", contaId: u.conta.id }))[0]!;
    expect(pagamento.transferenciaId).not.toBeNull();
    await atualizarTransacao(db, u.uid, pagamento.id, { ...noCartao, contaId: u.conta.id, cartaoId: null, data: "2026-12-10", valorCentavos: -1 });
    expect((await listarTransacoes(db, u.uid, { mes: "2026-12", contaId: u.conta.id }))[0]!.valorCentavos).toBe(-20000); // não edita transferência
    await excluirTransacao(db, u.uid, pagamento.id);
    expect((await listarTransacoes(db, u.uid, { mes: "2026-12" })).filter((t) => t.transferenciaId)).toEqual([]);

    // mover uma compra do cartão para a conta
    const compra = (await listarTransacoes(db, u.uid, { mes: "2026-11" }))[0]!;
    await atualizarTransacao(db, u.uid, compra.id, { ...noCartao, contaId: u.conta.id, cartaoId: null, data: compra.data, valorCentavos: compra.valorCentavos });
    expect((await listarContas(db, u.uid, "2026-11-30"))[0]!.saldoAtual).toBe(80000);
  });
});

describe("recorrência automática", () => {
  it("lança sozinha as vencidas (inclusive atrasadas), uma vez só, e ignora as manuais", async () => {
    const u = await novoUsuario("auto@exemplo.test");
    const base = { contaId: u.conta.id, categoriaId: u.despesa.id, periodicidade: "mensal" as const };
    await criarRecorrencia(db, u.uid, { ...base, descricao: "Aluguel auto", valorCentavos: -150000, proximaData: "2026-09-10", automatica: true });
    await criarRecorrencia(db, u.uid, { ...base, descricao: "Luz manual", valorCentavos: -20000, proximaData: "2026-09-10", automatica: false });

    // duas chamadas ao mesmo tempo + uma depois: nada duplica
    await Promise.all([lancarVencidas(db, u.uid, "2026-11-21"), lancarVencidas(db, u.uid, "2026-11-21")]);
    await lancarVencidas(db, u.uid, "2026-11-21");

    const lancados = [];
    for (const mes of ["2026-09", "2026-10", "2026-11", "2026-12"]) lancados.push(...(await listarTransacoes(db, u.uid, { mes })));
    expect(lancados.map((t) => `${t.data} ${t.descricao}`).sort()).toEqual([
      "2026-09-10 Aluguel auto",
      "2026-10-10 Aluguel auto",
      "2026-11-10 Aluguel auto",
    ]);
    const recs = await listarRecorrencias(db, u.uid);
    expect(recs.map((r) => `${r.descricao} ${r.proximaData}`).sort()).toEqual(["Aluguel auto 2026-12-10", "Luz manual 2026-09-10"]);

    // editar e pular
    const luz = recs.find((r) => r.descricao === "Luz manual")!;
    await atualizarRecorrencia(db, u.uid, luz.id, { ...base, descricao: "Luz manual", valorCentavos: -25000, proximaData: "2026-10-10", automatica: false });
    await pularOcorrencia(db, u.uid, luz.id);
    expect((await listarRecorrencias(db, u.uid)).find((r) => r.id === luz.id)).toMatchObject({ valorCentavos: -25000, proximaData: "2026-11-10" });

    // virar automática passa a lançar a manual também
    await definirAutomatica(db, u.uid, recs.find((r) => r.descricao === "Luz manual")!.id, true);
    await lancarVencidas(db, u.uid, "2026-11-21");
    expect((await listarTransacoes(db, u.uid, { mes: "2026-11" })).map((t) => t.descricao).sort()).toEqual(["Aluguel auto", "Luz manual"]);
    expect(await listarTransacoes(db, u.uid, { mes: "2026-10", texto: "Luz" })).toEqual([]); // outubro foi pulado
  });
});

describe("limite de tentativas de login", () => {
  it("bloqueia após 5 falhas em 15 min, libera depois da janela e ao acertar", async () => {
    const t0 = new Date("2026-11-21T12:00:00Z");
    const min = (m: number) => new Date(t0.getTime() + m * 60_000);
    for (let i = 0; i < MAX_FALHAS - 1; i++) await registrarFalha(db, "alvo@exemplo.test", min(i));
    expect(await loginBloqueado(db, "alvo@exemplo.test", min(5))).toBe(false);
    await registrarFalha(db, "alvo@exemplo.test", min(5));
    expect(await loginBloqueado(db, "alvo@exemplo.test", min(6))).toBe(true);
    expect(await loginBloqueado(db, "outro@exemplo.test", min(6))).toBe(false);
    expect(await loginBloqueado(db, "alvo@exemplo.test", min(30))).toBe(false); // janela passou
    await limparFalhas(db, "alvo@exemplo.test");
    expect(await loginBloqueado(db, "alvo@exemplo.test", min(6))).toBe(false);
  });
});

describe("meta do mês e gasto diário", () => {
  it("meta herda do mês anterior, é isolada por usuário e alimenta o gasto diário", async () => {
    const u = await novoUsuario("meta@exemplo.test"); // conta corrente R$ 1.000 de abertura, cartão fecha 3
    const outro = await novoUsuario("meta-outro@exemplo.test");
    expect(await gastoDiarioDoUsuario(db, u.uid, "2026-11-21")).toBeNull(); // sem meta, sem cálculo

    await definirMeta(db, u.uid, "2026-10", { modo: "saldo_final", valorCentavos: 20000 });
    expect(await metaVigente(db, u.uid, "2026-11")).toEqual({ modo: "saldo_final", valorCentavos: 20000, herdada: true });
    await definirMeta(db, u.uid, "2026-11", { modo: "saldo_final", valorCentavos: 10000 });
    await definirMeta(db, u.uid, "2026-11", { modo: "saldo_final", valorCentavos: 30000 }); // substitui
    expect(await metaVigente(db, u.uid, "2026-11")).toEqual({ modo: "saldo_final", valorCentavos: 30000, herdada: false });
    expect(await metaVigente(db, outro.uid, "2026-11")).toBeNull();

    // compra no cartão hoje: R$ 100
    await criarTransacao(db, u.uid, { contaId: null, cartaoId: u.cartao.id, categoriaId: null, data: "2026-11-21", valorCentavos: -10000, descricao: "x", observacao: null, parcelas: 1 });
    // compra no cartão de outro usuário não pode entrar na conta de u
    await criarTransacao(db, outro.uid, { contaId: null, cartaoId: outro.cartao.id, categoriaId: null, data: "2026-11-21", valorCentavos: -99900, descricao: "y", observacao: null, parcelas: 1 });

    const r = await gastoDiarioDoUsuario(db, u.uid, "2026-11-21");
    // saldo 1.000 - dívida 100 - meta 300 = 600; limite de hoje = (600 + 100 gastos hoje) / 10 dias = 70
    expect(r).toMatchObject({ disponivel: 60000, limiteHoje: 7000, gastoHoje: 10000, restanteHoje: -3000, estado: "estourado" });
  });
});

describe("orçamento por categoria", () => {
  it("limite vale nos meses seguintes, 0 tira, só despesa e isolado por usuário", async () => {
    const u = await novoUsuario("orc@exemplo.test");
    const outro = await novoUsuario("orc-outro@exemplo.test");
    const cats = await listarCategorias(db, u.uid);
    const carro = cats.find((c) => c.nome === "Carro" && !c.paiId)!;
    expect(cats.filter((c) => c.paiId === carro.id).map((c) => c.nome).sort()).toEqual(
      ["Combustível", "Estacionamento e pedágio", "IPVA e licenciamento", "Manutenção", "Seguro"],
    );

    await definirOrcamento(db, u.uid, "2026-10", carro.id, 50000);
    await definirOrcamento(db, u.uid, "2026-11", u.despesa.id, 200000);
    expect((await orcamentosVigentes(db, u.uid, "2026-11")).map((o) => [o.categoriaId, o.limiteCentavos]).sort()).toEqual(
      [[carro.id, 50000], [u.despesa.id, 200000]].sort(),
    );
    await definirOrcamento(db, u.uid, "2026-12", carro.id, 0);
    expect((await orcamentosVigentes(db, u.uid, "2026-12")).find((o) => o.categoriaId === carro.id)!.limiteCentavos).toBe(0);
    expect((await orcamentosVigentes(db, u.uid, "2026-11")).find((o) => o.categoriaId === carro.id)!.limiteCentavos).toBe(50000);

    await expect(definirOrcamento(db, u.uid, "2026-11", u.receita.id, 1)).rejects.toThrow(ErroDados);
    await expect(definirOrcamento(db, outro.uid, "2026-11", carro.id, 1)).rejects.toThrow(ErroDados);
    expect(await orcamentosVigentes(db, outro.uid, "2026-12")).toEqual([]);
  });
});

describe("crédito consolidado", () => {
  it("soma os cartões do usuário, faixas configuráveis e isoladas", async () => {
    const u = await novoUsuario("credito@exemplo.test"); // cartão limite R$ 5.000
    const outro = await novoUsuario("credito-outro@exemplo.test");
    await criarCartao(db, u.uid, { nome: "Segundo", bandeira: "Visa", limiteTotalCentavos: 500000, diaFechamento: 3, diaVencimento: 10 });
    const base = { contaId: null, cartaoId: u.cartao.id, categoriaId: null, observacao: null, descricao: "x" };
    await criarTransacao(db, u.uid, { ...base, data: "2026-11-05", valorCentavos: -300000, parcelas: 3 }); // 1.000/mês
    await criarTransacao(db, outro.uid, { ...base, cartaoId: outro.cartao.id, data: "2026-11-05", valorCentavos: -400000, parcelas: 1 });

    const r = (await resumoCredito(db, u.uid, "2026-11"))!;
    expect(r.consolidado).toMatchObject({ limiteTotal: 1000000, disponivel: 700000, usoPct: 30, faixa: "verde" });
    expect(r.gastoNoMes).toBe(100000);
    expect(r.parcelasFuturas).toEqual([{ mes: "2026-12", total: 100000 }, { mes: "2027-01", total: 100000 }]);

    await definirFaixas(db, u.uid, { amarelaPct: 20, vermelhaPct: 50 });
    expect((await resumoCredito(db, u.uid, "2026-11"))!.consolidado.faixa).toBe("amarela");
    expect((await resumoCredito(db, outro.uid, "2026-11"))!.faixas).toEqual({ amarelaPct: 30, vermelhaPct: 60 });
    await expect(definirFaixas(db, u.uid, { amarelaPct: 60, vermelhaPct: 50 })).rejects.toThrow(ErroDados);
    expect(await resumoCredito(db, (await novoUsuarioSemCartao("sem@exemplo.test")), "2026-11")).toBeNull();
  });
});

async function novoUsuarioSemCartao(email: string) {
  return criarUsuario(db, { nome: email, email, senhaHash: "x" });
}

describe("objetivos", () => {
  it("aportes, reserva fora do gasto diário, arquivar e isolamento", async () => {
    const u = await novoUsuario("obj@exemplo.test"); // conta R$ 1.000
    const outro = await novoUsuario("obj-outro@exemplo.test");
    await criarObjetivo(db, u.uid, { nome: "Viagem", valorAlvoCentavos: 600000, prazo: "2027-07-21" }, "2026-07-21");
    await criarObjetivo(db, u.uid, { nome: "Reserva", valorAlvoCentavos: 1000000, prazo: null }, "2026-07-21");
    const criados = await listarObjetivos(db, u.uid, "2026-11-21");
    expect(criados.map((o) => o.nome)).toEqual(["Viagem", "Reserva"]); // com prazo primeiro; sem prazo por último
    const [viagem, reserva] = criados;

    await aportar(db, u.uid, viagem!.id, { data: "2026-08-01", valorCentavos: 200000 });
    await aportar(db, u.uid, viagem!.id, { data: "2026-09-01", valorCentavos: -20000 });
    await aportar(db, u.uid, reserva!.id, { data: "2026-11-10", valorCentavos: 30000 });
    const lista = await listarObjetivos(db, u.uid, "2026-11-21");
    expect(lista.find((o) => o.nome === "Viagem")).toMatchObject({ guardado: 180000, aporteMensal: 52500, andamento: "no_ritmo" });
    expect(await reservadoEmObjetivos(db, u.uid)).toBe(210000);

    // gasto diário (terminar com R$ 0): saldo 1.000 - reserva 2.100 = não alcançável, falta 1.100
    await definirMeta(db, u.uid, "2026-11", { modo: "saldo_final", valorCentavos: 0 });
    expect(await gastoDiarioDoUsuario(db, u.uid, "2026-11-21")).toMatchObject({ alcancavel: false, falta: 110000 });
    await arquivarObjetivo(db, u.uid, viagem!.id, true);
    expect(await reservadoEmObjetivos(db, u.uid)).toBe(30000);

    // outro usuário não vê, não aporta, não edita nem apaga
    expect(await listarObjetivos(db, outro.uid, "2026-11-21")).toEqual([]);
    await expect(aportar(db, outro.uid, viagem!.id, { data: "2026-11-21", valorCentavos: 1 })).rejects.toThrow(ErroDados);
    const antes = await listarObjetivos(db, u.uid, "2026-11-21");
    await atualizarObjetivo(db, outro.uid, viagem!.id, { nome: "hack", valorAlvoCentavos: 1, prazo: null });
    await arquivarObjetivo(db, outro.uid, viagem!.id, false);
    await excluirAporte(db, outro.uid, antes.find((o) => o.nome === "Viagem")!.aportes[0]!.id);
    await excluirObjetivo(db, outro.uid, viagem!.id);
    expect(await listarObjetivos(db, u.uid, "2026-11-21")).toEqual(antes);
    expect(await reservadoEmObjetivos(db, outro.uid)).toBe(0);
  });
});

describe("Open Finance: sincronização", () => {
  const DIA = "2026-11-21";
  const agora = new Date(`${DIA}T15:00:00Z`);
  process.env.ENCRYPTION_KEY = "chave-de-teste";

  async function preparar(email: string) {
    const uid = await criarUsuario(db, { nome: email, email, senhaHash: "x" });
    const banco = new FakeProvider(dadosExemplo(DIA));
    const conexaoId = await criarConexao(db, uid, "fake", "item-xyz");
    return { uid, banco, conexaoId };
  }
  const todasDoUsuario = async (uid: string) => {
    const r = [];
    for (const mes of ["2026-10", "2026-11"]) r.push(...(await listarTransacoes(db, uid, { mes })));
    return r;
  };

  it("importa contas, cartão e transações; sincronizar de novo não duplica", async () => {
    const { uid, banco, conexaoId } = await preparar("of1@exemplo.test");
    expect(await itemIdDaConexao(db, uid, conexaoId)).toBe("item-xyz");
    expect(await criarConexao(db, uid, "fake", "item-xyz")).toBe(conexaoId); // mesmo item não cria outra conexão

    const r1 = await sincronizarConexao(db, uid, conexaoId, banco, agora);
    expect(r1).toEqual({ contas: 2, transacoes: 9 });
    await sincronizarConexao(db, uid, conexaoId, banco, agora);
    await sincronizarConexao(db, uid, conexaoId, banco, new Date(`${DIA}T20:00:00Z`));
    expect(await todasDoUsuario(uid)).toHaveLength(9);

    const [contaBanco] = await listarContas(db, uid, DIA);
    expect(contaBanco).toMatchObject({ nome: "Conta Simulada", origem: "open_finance", saldoAtual: 234567 }); // saldo do banco
    const [cartaoBanco] = await listarCartoes(db, uid);
    expect(cartaoBanco).toMatchObject({ limiteTotalCentavos: 300000, disponivel: 241010, diaVencimento: 10, diaFechamento: 1 });

    const ts = await todasDoUsuario(uid);
    expect(ts.filter((t) => t.transferenciaId).map((t) => t.descricao).sort()).toEqual(["PAGAMENTO FATURA CARTAO", "PAGAMENTO RECEBIDO"]);
    expect(ts.find((t) => t.descricao === "LOJA ELETRO 2/5")).toMatchObject({ parcelaAtual: 2, parcelasTotal: 5, valorCentavos: -20000 });
    const [conexao] = await listarConexoes(db, uid);
    expect(conexao).toMatchObject({ banco: "Banco Simulado", status: "atualizado", erro: null });
    expect(conexao).not.toHaveProperty("itemIdExterno"); // nunca vai para a tela
    expect(JSON.stringify(await exportarDados(db, uid))).not.toContain("item-xyz");
  });

  it("banco muda: atualiza valor, apaga o que sumiu, mantém a categoria do usuário; regras categorizam", async () => {
    const { uid, banco, conexaoId } = await preparar("of2@exemplo.test");
    const cats = await listarCategorias(db, uid);
    const transporte = cats.find((c) => c.nome === "Transporte público")!;
    const mercado = cats.find((c) => c.nome === "Mercado")!;
    const restaurante = cats.find((c) => c.nome === "Restaurante")!;
    await criarRegra(db, uid, { padraoTexto: "uber", categoriaId: transporte.id, prioridade: 0 });
    await sincronizarConexao(db, uid, conexaoId, banco, agora);

    let ts = await todasDoUsuario(uid);
    expect(ts.find((t) => t.descricao === "UBER *TRIP")!.categoriaId).toBe(transporte.id); // regra aplicada na importação
    const ifood = ts.find((t) => t.descricao === "IFOOD *RESTAURANTE")!;
    await atualizarTransacao(db, uid, ifood.id, { contaId: null, cartaoId: null, categoriaId: restaurante.id, data: "2020-01-01", valorCentavos: 1, descricao: "hack", observacao: "jantar" });
    ts = await todasDoUsuario(uid);
    // importado: só categoria e observação mudam
    expect(ts.find((t) => t.id === ifood.id)).toMatchObject({ categoriaId: restaurante.id, observacao: "jantar", valorCentavos: -12990, descricao: "IFOOD *RESTAURANTE" });
    await excluirTransacao(db, uid, ifood.id); // não exclui lançamento do banco
    expect(await todasDoUsuario(uid)).toHaveLength(9);

    // o banco corrige o valor do mercado e a compra da padaria (pendente) some
    banco.dados.transacoes["cartao-1"]!.find((t) => t.idExterno === "c3")!.valorCentavos = -26000;
    banco.dados.transacoes["cc-1"] = banco.dados.transacoes["cc-1"]!.filter((t) => t.idExterno !== "t3");
    await sincronizarConexao(db, uid, conexaoId, banco, agora);
    ts = await todasDoUsuario(uid);
    expect(ts).toHaveLength(8);
    expect(ts.find((t) => t.descricao === "MERCADO BOM PRECO")!.valorCentavos).toBe(-26000);
    expect(ts.find((t) => t.id === ifood.id)!.categoriaId).toBe(restaurante.id); // categoria do usuário mantida

    await criarRegra(db, uid, { padraoTexto: "mercado", categoriaId: mercado.id, prioridade: 0 });
    expect(await aplicarRegrasSemCategoria(db, uid)).toBe(1);
    expect((await todasDoUsuario(uid)).find((t) => t.descricao === "MERCADO BOM PRECO")!.categoriaId).toBe(mercado.id);
  });

  it("registrar item: recusa item de outro usuário, aceita o do próprio e o do Meu Pluggy (sem dono)", async () => {
    const { uid, banco } = await preparar("of8@exemplo.test");
    banco.dados.item = { ...banco.dados.item, clientUserId: "outra-pessoa" };
    await expect(registrarItem(db, uid, banco, "item-alheio")).rejects.toThrow("outro usuário");
    banco.dados.item = { ...banco.dados.item, clientUserId: uid };
    expect(await registrarItem(db, uid, banco, "item-meu")).toMatchObject({ contas: 2, transacoes: 9 });
    banco.buscarItem = async () => {
      throw new Error("404");
    };
    await expect(registrarItem(db, uid, banco, "nao-existe")).rejects.toThrow("Confira o ID");
  });

  it("erro no banco fica registrado na conexão", async () => {
    const { uid, banco, conexaoId } = await preparar("of3@exemplo.test");
    banco.listarContas = async () => {
      throw new Error("Pluggy GET /accounts falhou (500)");
    };
    await expect(sincronizarConexao(db, uid, conexaoId, banco, agora)).rejects.toThrow(ErroDados);
    expect((await listarConexoes(db, uid))[0]).toMatchObject({ status: "erro", erro: "Pluggy GET /accounts falhou (500)" });
  });

  it("desconectar: mantendo histórico o saldo de hoje fica igual; sem manter, apaga o que veio do banco", async () => {
    const a = await preparar("of4@exemplo.test");
    await sincronizarConexao(db, a.uid, a.conexaoId, a.banco, agora);
    await desconectar(db, a.uid, a.conexaoId, a.banco, true, DIA);
    const [c] = await listarContas(db, a.uid, DIA);
    expect(c).toMatchObject({ origem: "manual", saldoAtual: 234567, conexaoId: null });
    expect(await todasDoUsuario(a.uid)).toHaveLength(9);
    expect(await listarConexoes(db, a.uid)).toEqual([]);

    const b = await preparar("of5@exemplo.test");
    await sincronizarConexao(db, b.uid, b.conexaoId, b.banco, agora);
    await desconectar(db, b.uid, b.conexaoId, b.banco, false, DIA);
    expect(await listarContas(db, b.uid, DIA)).toEqual([]);
    expect(await listarCartoes(db, b.uid)).toEqual([]);
    expect(await todasDoUsuario(b.uid)).toEqual([]);
  });

  it("isolamento: outro usuário não sincroniza, lê nem desconecta a conexão alheia", async () => {
    const a = await preparar("of6@exemplo.test");
    const b = await preparar("of7@exemplo.test");
    await sincronizarConexao(db, a.uid, a.conexaoId, a.banco, agora);
    await expect(sincronizarConexao(db, b.uid, a.conexaoId, b.banco, agora)).rejects.toThrow(ErroDados);
    await expect(itemIdDaConexao(db, b.uid, a.conexaoId)).rejects.toThrow(ErroDados);
    await expect(desconectar(db, b.uid, a.conexaoId, b.banco, false)).rejects.toThrow(ErroDados);
    await expect(criarRegra(db, b.uid, { padraoTexto: "xx", categoriaId: (await listarCategorias(db, a.uid))[0]!.id, prioridade: 0 })).rejects.toThrow(ErroDados);
    expect(await todasDoUsuario(a.uid)).toHaveLength(9);
    expect((await listarConexoes(db, b.uid)).map((c) => c.id)).toEqual([b.conexaoId]);
    expect(await listarRegras(db, b.uid)).toEqual([]);
  });
});
