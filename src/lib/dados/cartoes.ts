import { and, asc, eq, isNotNull } from "drizzle-orm";
import type { Db } from "@/db";
import { cartao, transacao } from "@/db/schema";
import { resumoDoCartao } from "@/lib/calculos/cartao";
import { cartaoDoUsuario, contaDoUsuario } from "./comum";

export type DadosCartao = {
  nome: string;
  bandeira: string;
  limiteTotalCentavos: number;
  diaFechamento: number;
  diaVencimento: number;
};

/** Cartões com faturas, devido e limite disponível calculados. */
export async function listarCartoes(db: Db, uid: string) {
  const [cartoes, lancs] = await Promise.all([
    db.select().from(cartao).where(eq(cartao.usuarioId, uid)).orderBy(asc(cartao.nome)),
    db
      .select({ cartaoId: transacao.cartaoId, data: transacao.data, valorCentavos: transacao.valorCentavos })
      .from(transacao)
      .where(and(eq(transacao.usuarioId, uid), isNotNull(transacao.cartaoId))),
  ]);
  return cartoes.map((c) => ({ ...c, ...resumoDoCartao(c, lancs.filter((l) => l.cartaoId === c.id)) }));
}

export const criarCartao = (db: Db, uid: string, d: DadosCartao) => db.insert(cartao).values({ ...d, usuarioId: uid });

export const atualizarCartao = (db: Db, uid: string, id: string, d: DadosCartao) =>
  db.update(cartao).set(d).where(and(eq(cartao.id, id), eq(cartao.usuarioId, uid)));

export const excluirCartao = (db: Db, uid: string, id: string) =>
  db.delete(cartao).where(and(eq(cartao.id, id), eq(cartao.usuarioId, uid)));

/**
 * Pagamento de fatura: sai da conta e entra no cartão, ligados por transferencia_id.
 * Não é despesa (a compra já foi contada no dia em que foi feita).
 */
export function pagarFatura(db: Db, uid: string, d: { cartaoId: string; contaId: string; valorCentavos: number; data: string }) {
  return db.transaction(async (tx) => {
    const c = await cartaoDoUsuario(tx, uid, d.cartaoId);
    await contaDoUsuario(tx, uid, d.contaId);
    const base = { usuarioId: uid, data: d.data, descricao: `Pagamento da fatura ${c.nome}`, transferenciaId: crypto.randomUUID() };
    await tx.insert(transacao).values([
      { ...base, contaId: d.contaId, valorCentavos: -Math.abs(d.valorCentavos) },
      { ...base, cartaoId: d.cartaoId, valorCentavos: Math.abs(d.valorCentavos) },
    ]);
  });
}
