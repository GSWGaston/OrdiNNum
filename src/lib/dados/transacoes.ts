import { and, desc, eq, gte, ilike, inArray, isNull, lte, or, type SQL } from "drizzle-orm";
import type { Db } from "@/db";
import { categoria, transacao } from "@/db/schema";
import { limitesDoMes } from "@/lib/calculos/datas";
import { gerarParcelas } from "@/lib/calculos/parcelas";
import { cartaoDoUsuario, categoriaDoUsuario, contaDoUsuario, ErroDados } from "./comum";

/** `contaId` filtra por conta ou por cartão (ids são únicos entre as duas tabelas). */
export type Filtro = { mes: string; contaId?: string; categoriaId?: string; texto?: string };
export type DadosTransacao = {
  contaId: string | null;
  cartaoId: string | null;
  categoriaId: string | null;
  data: string;
  valorCentavos: number;
  descricao: string;
  observacao: string | null;
};

export function listarTransacoes(db: Db, uid: string, f: Filtro) {
  const { inicio, fim } = limitesDoMes(f.mes);
  const conds: SQL[] = [eq(transacao.usuarioId, uid), gte(transacao.data, inicio), lte(transacao.data, fim)];
  if (f.contaId) conds.push(or(eq(transacao.contaId, f.contaId), eq(transacao.cartaoId, f.contaId))!);
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
  if (!d.contaId === !d.cartaoId) throw new ErroDados("Escolha uma conta ou um cartão.");
  if (d.contaId) await contaDoUsuario(db, uid, d.contaId);
  if (d.cartaoId) await cartaoDoUsuario(db, uid, d.cartaoId);
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

/** Edita um lançamento comum. Metades de transferência (pagamento de fatura) não se editam: exclua e refaça. */
export async function atualizarTransacao(db: Db, uid: string, id: string, d: DadosTransacao) {
  await conferir(db, uid, d);
  await db
    .update(transacao)
    .set(d)
    .where(and(eq(transacao.id, id), eq(transacao.usuarioId, uid), isNull(transacao.transferenciaId)));
}

/** Exclui o lançamento; se for metade de uma transferência, exclui o par junto. */
export async function excluirTransacao(db: Db, uid: string, id: string) {
  const [t] = await db
    .select({ transferenciaId: transacao.transferenciaId })
    .from(transacao)
    .where(and(eq(transacao.id, id), eq(transacao.usuarioId, uid)));
  if (!t) return;
  await db
    .delete(transacao)
    .where(and(eq(transacao.usuarioId, uid), t.transferenciaId ? eq(transacao.transferenciaId, t.transferenciaId) : eq(transacao.id, id)));
}

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
