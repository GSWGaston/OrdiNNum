import { and, desc, eq, gte, ilike, inArray, lte, or, type SQL } from "drizzle-orm";
import type { Db } from "@/db";
import { categoria, transacao } from "@/db/schema";
import { limitesDoMes } from "@/lib/calculos/datas";
import { gerarParcelas } from "@/lib/calculos/parcelas";
import { categoriaDoUsuario, contaDoUsuario } from "./comum";

export type Filtro = { mes: string; contaId?: string; categoriaId?: string; texto?: string };
export type DadosTransacao = {
  contaId: string;
  categoriaId: string | null;
  data: string;
  valorCentavos: number;
  descricao: string;
  observacao: string | null;
};

export function listarTransacoes(db: Db, uid: string, f: Filtro) {
  const { inicio, fim } = limitesDoMes(f.mes);
  const conds: SQL[] = [eq(transacao.usuarioId, uid), gte(transacao.data, inicio), lte(transacao.data, fim)];
  if (f.contaId) conds.push(eq(transacao.contaId, f.contaId));
  if (f.categoriaId) {
    const filhas = db
      .select({ id: categoria.id })
      .from(categoria)
      .where(and(eq(categoria.usuarioId, uid), eq(categoria.paiId, f.categoriaId)));
    conds.push(or(eq(transacao.categoriaId, f.categoriaId), inArray(transacao.categoriaId, filhas))!);
  }
  if (f.texto) conds.push(ilike(transacao.descricao, `%${f.texto.replace(/[\\%_]/g, "\\$&")}%`));
  return db.select().from(transacao).where(and(...conds)).orderBy(desc(transacao.data), desc(transacao.descricao));
}

async function conferir(db: Db, uid: string, d: DadosTransacao) {
  await contaDoUsuario(db, uid, d.contaId);
  if (d.categoriaId) await categoriaDoUsuario(db, uid, d.categoriaId);
}

/** Cria um lançamento; com parcelas > 1 gera uma transação por mês ligadas por grupo_parcelas. */
export function criarTransacao(db: Db, uid: string, d: DadosTransacao & { parcelas: number; recorrenciaId?: string }) {
  return db.transaction(async (tx) => {
    await conferir(tx, uid, d);
    const { parcelas, ...base } = d;
    if (parcelas <= 1) return void (await tx.insert(transacao).values({ ...base, usuarioId: uid }));
    const grupoParcelas = crypto.randomUUID();
    await tx.insert(transacao).values(
      gerarParcelas(d.valorCentavos, parcelas, d.data).map((p) => ({
        ...base,
        usuarioId: uid,
        data: p.data,
        valorCentavos: p.valorCentavos,
        parcelaAtual: p.parcela,
        parcelasTotal: parcelas,
        grupoParcelas,
      })),
    );
  });
}

export async function atualizarTransacao(db: Db, uid: string, id: string, d: DadosTransacao) {
  await conferir(db, uid, d);
  await db.update(transacao).set(d).where(and(eq(transacao.id, id), eq(transacao.usuarioId, uid)));
}

export const excluirTransacao = (db: Db, uid: string, id: string) =>
  db.delete(transacao).where(and(eq(transacao.id, id), eq(transacao.usuarioId, uid)));

export const excluirParcelamento = (db: Db, uid: string, grupo: string) =>
  db.delete(transacao).where(and(eq(transacao.grupoParcelas, grupo), eq(transacao.usuarioId, uid)));

export async function categorizarEmLote(db: Db, uid: string, ids: string[], categoriaId: string | null) {
  if (!ids.length) return;
  if (categoriaId) await categoriaDoUsuario(db, uid, categoriaId);
  await db
    .update(transacao)
    .set({ categoriaId })
    .where(and(inArray(transacao.id, ids), eq(transacao.usuarioId, uid)));
}
