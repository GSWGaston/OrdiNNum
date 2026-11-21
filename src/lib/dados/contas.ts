import { and, asc, eq, lte, sum } from "drizzle-orm";
import type { Db } from "@/db";
import { conta, transacao } from "@/db/schema";
import { saldoDaConta } from "@/lib/calculos/resumo";

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

export const atualizarConta = (db: Db, uid: string, id: string, d: DadosConta) =>
  db.update(conta).set(d).where(and(eq(conta.id, id), eq(conta.usuarioId, uid)));

export const excluirConta = (db: Db, uid: string, id: string) =>
  db.delete(conta).where(and(eq(conta.id, id), eq(conta.usuarioId, uid)));
