import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { categoria } from "@/db/schema";
import { categoriaDoUsuario, ErroDados } from "./comum";

export type Categoria = typeof categoria.$inferSelect;

export const listarCategorias = (db: Db, uid: string) =>
  db.select().from(categoria).where(eq(categoria.usuarioId, uid)).orderBy(asc(categoria.tipo), asc(categoria.nome));

/** Ordena pai seguido das filhas, para selects e listas. */
export function emArvore(cats: Categoria[]) {
  cats = [...cats].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return cats
    .filter((c) => !c.paiId)
    .flatMap((p) => [{ ...p, nivel: 0 }, ...cats.filter((f) => f.paiId === p.id).map((f) => ({ ...f, nivel: 1 }))]);
}

export async function criarCategoria(
  db: Db,
  uid: string,
  d: { nome: string; tipo: "receita" | "despesa"; cor: string; paiId: string | null },
) {
  if (d.paiId) {
    const pai = await categoriaDoUsuario(db, uid, d.paiId);
    if (pai.paiId) throw new ErroDados("Subcategoria só pode ficar dentro de uma categoria principal.");
    d = { ...d, tipo: pai.tipo };
  }
  await db.insert(categoria).values({ ...d, usuarioId: uid });
}

export const atualizarCategoria = (db: Db, uid: string, id: string, d: { nome: string; cor: string }) =>
  db.update(categoria).set(d).where(and(eq(categoria.id, id), eq(categoria.usuarioId, uid)));

export const excluirCategoria = (db: Db, uid: string, id: string) =>
  db.delete(categoria).where(and(eq(categoria.id, id), eq(categoria.usuarioId, uid)));
