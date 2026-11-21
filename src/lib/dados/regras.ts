import { and, asc, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import { regraCategoria, transacao } from "@/db/schema";
import { categorizar } from "@/lib/calculos/regras";
import { categoriaDoUsuario, ErroDados } from "./comum";

export const listarRegras = (db: Db, uid: string) =>
  db.select().from(regraCategoria).where(eq(regraCategoria.usuarioId, uid)).orderBy(asc(regraCategoria.padraoTexto));

export async function criarRegra(db: Db, uid: string, d: { padraoTexto: string; categoriaId: string; prioridade: number }) {
  if (d.padraoTexto.trim().length < 2) throw new ErroDados("O texto da regra precisa de pelo menos 2 letras.");
  await categoriaDoUsuario(db, uid, d.categoriaId);
  await db.insert(regraCategoria).values({ ...d, padraoTexto: d.padraoTexto.trim(), usuarioId: uid });
}

export const excluirRegra = (db: Db, uid: string, id: string) =>
  db.delete(regraCategoria).where(and(eq(regraCategoria.id, id), eq(regraCategoria.usuarioId, uid)));

/** Aplica as regras aos lançamentos ainda sem categoria (não mexe no que o usuário já categorizou). */
export async function aplicarRegrasSemCategoria(db: Db, uid: string) {
  const regras = await listarRegras(db, uid);
  if (!regras.length) return 0;
  const semCategoria = await db
    .select({ id: transacao.id, descricao: transacao.descricao })
    .from(transacao)
    .where(and(eq(transacao.usuarioId, uid), isNull(transacao.categoriaId), isNull(transacao.transferenciaId)));
  let n = 0;
  for (const t of semCategoria) {
    const categoriaId = categorizar(t.descricao, regras);
    if (!categoriaId) continue;
    await db.update(transacao).set({ categoriaId }).where(and(eq(transacao.id, t.id), eq(transacao.usuarioId, uid)));
    n++;
  }
  return n;
}
