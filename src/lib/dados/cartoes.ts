import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import { cartao, transacao } from "@/db/schema";
import { resumoDoCartao } from "@/lib/calculos/cartao";
import { hoje } from "@/lib/calculos/datas";
import { cartaoDoUsuario, contaDoUsuario } from "./comum";
import { categorizarPagamentosDeFatura } from "./transferencias";

export type DadosCartao = {
  nome: string;
  bandeira: string;
  limiteTotalCentavos: number;
  diaFechamento: number;
  diaVencimento: number;
  limitePessoalCentavos?: number | null;
};

/** Cartões com faturas, devido e limite disponível calculados. */
export async function listarCartoes(db: Db, uid: string) {
  const [cartoes, lancs] = await Promise.all([
    db.select().from(cartao).where(eq(cartao.usuarioId, uid)).orderBy(asc(cartao.nome)),
    db
      .select({
        cartaoId: transacao.cartaoId,
        data: transacao.data,
        valorCentavos: transacao.valorCentavos,
        grupoParcelas: transacao.grupoParcelas,
        transferenciaId: transacao.transferenciaId,
        descricao: transacao.descricao,
        parcelaAtual: transacao.parcelaAtual,
        parcelasTotal: transacao.parcelasTotal,
      })
      .from(transacao)
      .where(and(eq(transacao.usuarioId, uid), isNotNull(transacao.cartaoId))),
  ]);
  const dia = hoje();
  return cartoes.map((c) => {
    const comPessoal = { ...c, limitePessoalCentavos: c.limiteUsuarioCentavos };
    return { ...comPessoal, ...resumoDoCartao(comPessoal, lancs.filter((l) => l.cartaoId === c.id), dia) };
  });
}

const colunas = ({ limitePessoalCentavos, ...d }: DadosCartao) => ({ ...d, limiteUsuarioCentavos: limitePessoalCentavos ?? null });

export const criarCartao = (db: Db, uid: string, d: DadosCartao) => db.insert(cartao).values({ ...colunas(d), usuarioId: uid });

/** Cartão manual: tudo. Cartão do banco: o limite do cartão vem do banco; o resto (inclusive o limite pessoal) é seu. */
export async function atualizarCartao(db: Db, uid: string, id: string, d: DadosCartao) {
  const dono = and(eq(cartao.id, id), eq(cartao.usuarioId, uid));
  await db.update(cartao).set(colunas(d)).where(and(dono, isNull(cartao.conexaoId)));
  const { nome, bandeira, diaFechamento, diaVencimento, limiteUsuarioCentavos } = colunas(d);
  await db
    .update(cartao)
    .set({ nome, bandeira, diaFechamento, diaVencimento, limiteUsuarioCentavos })
    .where(and(dono, isNotNull(cartao.conexaoId)));
}

/** Marca (ou desmarca, com null) como paga a fatura que vence em `vencimento`. Só cartão do banco. */
export const marcarFaturaPaga = (db: Db, uid: string, id: string, vencimento: string | null) =>
  db
    .update(cartao)
    .set({ faturaPagaVencimento: vencimento })
    .where(and(eq(cartao.id, id), eq(cartao.usuarioId, uid), isNotNull(cartao.conexaoId)));

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
    await categorizarPagamentosDeFatura(tx, uid);
  });
}
