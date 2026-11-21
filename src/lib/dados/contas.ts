import { and, asc, eq, lte, sum } from "drizzle-orm";
import type { Db } from "@/db";
import { conta, transacao } from "@/db/schema";
import { saldoDaConta } from "@/lib/calculos/resumo";
import { contaDoUsuario, ErroDados } from "./comum";

/**
 * Transferência entre contas próprias: par de lançamentos ligados por transferencia_id.
 * Move dinheiro, não é receita nem despesa.
 */
export async function transferir(
  db: Db,
  uid: string,
  d: { deContaId: string; paraContaId: string; valorCentavos: number; data: string; descricao: string },
) {
  if (d.deContaId === d.paraContaId) throw new ErroDados("Escolha contas diferentes.");
  return db.transaction(async (tx) => {
    await contaDoUsuario(tx, uid, d.deContaId);
    await contaDoUsuario(tx, uid, d.paraContaId);
    const base = { usuarioId: uid, data: d.data, descricao: d.descricao || "Transferência", transferenciaId: crypto.randomUUID() };
    const v = Math.abs(d.valorCentavos);
    await tx.insert(transacao).values([
      { ...base, contaId: d.deContaId, valorCentavos: -v },
      { ...base, contaId: d.paraContaId, valorCentavos: v },
    ]);
  });
}

export type DadosConta = { nome: string; tipo: (typeof conta.$inferInsert)["tipo"]; saldoCentavos: number };

/** Contas com saldo atual (lançamentos até `ate`, inclusive). */
export async function listarContas(db: Db, uid: string, ate: string) {
  const [contas, somas] = await Promise.all([
    db.select().from(conta).where(eq(conta.usuarioId, uid)).orderBy(asc(conta.nome)),
    db
      .select({ contaId: transacao.contaId, total: sum(transacao.valorCentavos).mapWith(Number) })
      .from(transacao)
      .where(and(eq(transacao.usuarioId, uid), lte(transacao.data, ate)))
      .groupBy(transacao.contaId),
  ]);
  const porConta = new Map(somas.map((s) => [s.contaId, s.total]));
  return contas.map((c) => ({ ...c, saldoAtual: saldoDaConta(c, porConta.get(c.id) ?? 0) }));
}

export const criarConta = (db: Db, uid: string, d: DadosConta) => db.insert(conta).values({ ...d, usuarioId: uid });

export async function atualizarConta(db: Db, uid: string, id: string, d: DadosConta) {
  const manual = and(eq(conta.id, id), eq(conta.usuarioId, uid), eq(conta.origem, "manual"));
  const doBanco = and(eq(conta.id, id), eq(conta.usuarioId, uid), eq(conta.origem, "open_finance"));
  await db.update(conta).set(d).where(manual);
  await db.update(conta).set({ nome: d.nome }).where(doBanco); // saldo e tipo vêm do banco
}

/** Conta ligada ao banco sai desconectando o banco (para escolher se mantém o histórico). */
export const excluirConta = (db: Db, uid: string, id: string) =>
  db.delete(conta).where(and(eq(conta.id, id), eq(conta.usuarioId, uid), eq(conta.origem, "manual")));
